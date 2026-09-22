import { Authenticator } from "@app/lib/auth";
import { convertMarkdownToBlockHtml } from "@app/lib/editor/skill_instructions_html";
import type {
  SeededKnowledgeNode,
  SeededScenario,
  TestCase,
} from "@app/tests/conversational-building-evals/lib/types";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
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
 * listing tools isolated when scenarios run concurrently. The `suggest_*` tools need an
 * interactive user with write access, which is why the skills are created by (and the run
 * executes as) a real member rather than the internal admin.
 */
export async function seedScenario(
  testCase: TestCase
): Promise<SeededScenario> {
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
      // The factory's create path has no instructions override; a second version carries them.
      const created = await AgentConfigurationFactory.createTestAgent(auth, {
        name: agent.name,
        description: agent.description,
      });
      await AgentConfigurationFactory.updateTestAgent(auth, created.sId, {
        name: agent.name,
        description: agent.description,
        instructions: agent.instructionsHtml,
        instructionsHtml: agent.instructionsHtml,
      });
      agentIdsByKey.set(agent.key, created.sId);
    }

    const skillIdsByKey = new Map<string, string>();
    for (const seed of testCase.workspaceSeed.skills) {
      const skill = await SkillFactory.create(auth, {
        name: seed.name,
        agentFacingDescription: seed.agentFacingDescription,
        userFacingDescription: seed.userFacingDescription ?? "",
        instructions: seed.instructions,
        instructionsHtml: convertMarkdownToBlockHtml(seed.instructions),
        availability: seed.availability,
      });
      skillIdsByKey.set(seed.key, skill.sId);
    }

    // Pick up the editor group memberships created alongside the skills.
    await auth.refresh();

    return {
      auth,
      skillIdsByKey,
      memberIdsByKey,
      toolIdsByKey,
      knowledgeByKey,
      agentIdsByKey,
    };
  });
}
