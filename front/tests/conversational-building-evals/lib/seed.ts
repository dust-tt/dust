import {
  AGENT_SEARCH_ALIAS_NAME,
  SKILL_SEARCH_ALIAS_NAME,
  withEs,
} from "@app/lib/api/elasticsearch";
import { Authenticator } from "@app/lib/auth";
import { getMarkdownPipeline } from "@app/lib/editor/server_markdown_pipeline";
import {
  convertBlockHtmlToMarkdown,
  convertMarkdownToBlockHtml,
} from "@app/lib/editor/skill_instructions_html";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { serializeToolTag } from "@app/lib/tools/format";
import {
  deleteWorkspaceAgentSearchActivity,
  deleteWorkspaceSkillSearchActivity,
  indexAgentSearchActivity,
  indexSkillSearchActivity,
} from "@app/temporal/es_indexation/activities";
import type {
  SeededKnowledgeNode,
  SeededScenario,
  TestCase,
} from "@app/tests/conversational-building-evals/lib/types";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentMCPServerConfigurationFactory } from "@app/tests/utils/AgentMCPServerConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { runInCommittedTransaction } from "@app/tests/utils/eval_workspace";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { CoreAPIDocument } from "@app/types/core/data_source";

// Skill instructions cite a seeded tool as `{{tool:<key>}}`, replaced at seed time by the
// `<tool/>` tag of its view, whose id the database assigns.
const TOOL_PLACEHOLDER_REGEX = /\{\{tool:([^}]+)\}\}/g;

// Document nodes live in the core service, which the eval does not run. Seeded documents are
// registered here by core data source id, and the test file answers core's bulk search from
// this registry so `search_knowledge` returns them for any query.
const seededDocumentsByDataSourceId = new Map<string, CoreAPIDocument[]>();

export function getSeededDocuments(dataSourceIds: string[]): CoreAPIDocument[] {
  return dataSourceIds.flatMap(
    (id) => seededDocumentsByDataSourceId.get(id) ?? []
  );
}

/**
 * Creates the scenario's workspace, an admin member, and the seeded members, tools, knowledge
 * and skills, then returns that member's authenticator. One workspace per scenario keeps the
 * listing tools isolated when scenarios run concurrently. The `suggest` tool needs an
 * interactive user with write access, which is why the skills are created by (and the run
 * executes as) a real member rather than the internal admin.
 */
export async function seedScenario(
  testCase: TestCase
): Promise<SeededScenario> {
  const scenario = await seedDatabase(testCase);
  await indexSeededEntities(scenario);
  return scenario;
}

/**
 * The search tools read from Elasticsearch, which the factories do not feed: production indexes
 * through Temporal workflows. Runs the indexation activities directly once the seed is committed
 * (they read the entities back with their own authenticator), then refreshes the indices so the
 * documents are searchable as soon as the run starts.
 */
async function indexSeededEntities(scenario: SeededScenario): Promise<void> {
  const workspaceId = scenario.auth.getNonNullableWorkspace().sId;
  for (const skillId of scenario.skillIdsByKey.values()) {
    await indexSkillSearchActivity({ workspaceId, skillId });
  }
  for (const agentId of scenario.agentIdsByKey.values()) {
    await indexAgentSearchActivity({ workspaceId, agentId });
  }
  const refreshResult = await withEs((client) =>
    client.indices.refresh({
      index: [SKILL_SEARCH_ALIAS_NAME, AGENT_SEARCH_ALIAS_NAME],
    })
  );
  if (refreshResult.isErr()) {
    throw refreshResult.error;
  }
}

/** Removes the search documents `seedScenario` indexed for the scenario's workspace. */
export async function deleteSeededSearchDocuments(
  scenario: SeededScenario
): Promise<void> {
  const workspaceId = scenario.auth.getNonNullableWorkspace().sId;
  await deleteWorkspaceSkillSearchActivity({ workspaceId });
  await deleteWorkspaceAgentSearchActivity({ workspaceId });
}

type SeededToolView = { view: MCPServerViewResource; name: string };

function getToolView(
  toolViewsByKey: Map<string, SeededToolView>,
  toolKey: string
): SeededToolView {
  const view = toolViewsByKey.get(toolKey);
  if (!view) {
    throw new Error(`Seed references unknown tool key "${toolKey}"`);
  }
  return view;
}

async function seedDatabase(testCase: TestCase): Promise<SeededScenario> {
  return runInCommittedTransaction(async () => {
    const workspace = await WorkspaceFactory.basic();
    const user = await UserFactory.basic();
    const { globalSpace } = await SpaceFactory.defaults(
      await Authenticator.internalAdminForWorkspace(workspace.sId)
    );
    await MembershipFactory.associate(workspace, user, { role: "admin" });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const memberIdsByKey = new Map<string, string>();
    for (const member of testCase.workspaceSeed.members ?? []) {
      const memberUser = await UserFactory.withName(
        member.firstName,
        member.lastName
      );
      await MembershipFactory.associate(workspace, memberUser, {
        role: "user",
      });
      memberIdsByKey.set(member.key, memberUser.sId);
    }

    const toolIdsByKey = new Map<string, string>();
    const toolViewsByKey = new Map<string, SeededToolView>();
    for (const tool of testCase.workspaceSeed.tools ?? []) {
      const server = await RemoteMCPServerFactory.create(workspace, {
        name: tool.name,
        description: tool.description,
        tools: tool.functions.map((fn) => ({
          name: fn.name,
          description: fn.description,
          inputSchema: undefined,
        })),
      });
      const view = await MCPServerViewFactory.create(
        workspace,
        server.sId,
        globalSpace
      );
      toolIdsByKey.set(tool.key, view.sId);
      toolViewsByKey.set(tool.key, { view, name: tool.name });
    }

    const knowledgeByKey = new Map<string, SeededKnowledgeNode>();
    for (const knowledge of testCase.workspaceSeed.knowledge ?? []) {
      const view = await DataSourceViewFactory.folder(workspace, globalSpace);
      const coreDataSourceId = view.dataSource.dustAPIDataSourceId;
      const now = Date.now();
      seededDocumentsByDataSourceId.set(
        coreDataSourceId,
        knowledge.documents.map((doc) => ({
          data_source_id: coreDataSourceId,
          created: now,
          document_id: `${knowledge.name}-${doc.key}`
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-"),
          parents: [],
          parent_id: null,
          timestamp: now,
          tags: [`title:${doc.title}`],
          source_url: null,
          hash: doc.key,
          text_size: doc.text.length,
          chunk_count: 1,
          chunks: [{ text: doc.text, hash: doc.key, offset: 0, score: 1 }],
          title: doc.title,
          mime_type: "text/plain",
          text: doc.text,
        }))
      );
      for (const doc of seededDocumentsByDataSourceId.get(coreDataSourceId) ??
        []) {
        const seed = knowledge.documents.find((d) => d.title === doc.title);
        if (seed) {
          knowledgeByKey.set(seed.key, {
            nodeId: doc.document_id,
            title: seed.title,
            spaceId: globalSpace.sId,
            dataSourceViewId: view.sId,
          });
        }
      }
    }

    const agentIdsByKey = new Map<string, string>();
    for (const agent of testCase.workspaceSeed.agents ?? []) {
      const created = await AgentConfigurationFactory.createTestAgent(auth, {
        name: agent.name,
        description: agent.description,
        instructions: convertBlockHtmlToMarkdown(
          agent.instructionsHtml,
          getMarkdownPipeline("agent")
        ),
        instructionsHtml: agent.instructionsHtml,
        model: agent.model,
      });
      for (const toolKey of agent.toolKeys ?? []) {
        await AgentMCPServerConfigurationFactory.create(auth, globalSpace, {
          agent: created,
          mcpServerView: getToolView(toolViewsByKey, toolKey).view,
        });
      }
      agentIdsByKey.set(agent.key, created.sId);
    }

    const skillIdsByKey = new Map<string, string>();
    for (const seed of testCase.workspaceSeed.skills) {
      const toolKeys = [
        ...seed.instructions.matchAll(TOOL_PLACEHOLDER_REGEX),
      ].map(([, toolKey]) => toolKey);
      const instructions = seed.instructions.replace(
        TOOL_PLACEHOLDER_REGEX,
        (_, toolKey: string) => {
          const { view, name } = getToolView(toolViewsByKey, toolKey);
          return serializeToolTag({ icon: null, id: view.sId, name });
        }
      );
      const instructionsHtml = convertMarkdownToBlockHtml(
        instructions,
        getMarkdownPipeline("skill")
      );
      const skill = await SkillFactory.create(auth, {
        name: seed.name,
        agentFacingDescription: seed.agentFacingDescription,
        userFacingDescription: seed.userFacingDescription ?? "",
        instructions,
        instructionsHtml,
        availability: seed.availability,
        mcpServerViews: [...new Set(toolKeys)].map(
          (toolKey) => getToolView(toolViewsByKey, toolKey).view
        ),
      });
      skillIdsByKey.set(seed.key, skill.sId);
    }

    // Pick up the editor group memberships created alongside the skills.
    await auth.refresh();

    // Tools run in an agent loop: `suggest` needs the conversation it is called from.
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "dust",
      messagesCreatedAt: [],
    });

    return {
      auth,
      skillIdsByKey,
      memberIdsByKey,
      toolIdsByKey,
      knowledgeByKey,
      agentIdsByKey,
      conversation,
    };
  });
}
