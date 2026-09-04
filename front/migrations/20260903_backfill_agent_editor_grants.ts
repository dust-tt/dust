import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import {
  AgentResource,
  fetchAllAgentsForWorkspace,
} from "@app/lib/resources/agent_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { ModelId } from "@app/types/shared/model_id";
import type { LightWorkspaceType } from "@app/types/user";
import assert from "assert";
import { Op } from "sequelize";

const AGENT_CONCURRENCY = 8;
const WORKSPACE_CONCURRENCY = 4;

const AgentConfigModel: ModelStaticWorkspaceAware<AgentConfigurationModel> =
  AgentConfigurationModel;

type EditorState = {
  legacyEditors: UserResource[];
  grantEditors: UserResource[];
  authors: UserResource[];
};

type BackfillSpec = {
  execute: boolean;
  logger: Logger;
  workspace: LightWorkspaceType;
};

export type AgentEditorGrantStats = {
  agentCount: number;
  editorGrantsToAdd: number;
  mismatchedAgentCount: number;
  authorsWithoutGrantCount: number;
};

function userDifference(
  left: UserResource[],
  right: UserResource[]
): UserResource[] {
  const rightIds = new Set(right.map(({ id }) => id));
  return left.filter(({ id }) => !rightIds.has(id));
}

async function fetchLegacyEditors(
  auth: Authenticator,
  configuration: AgentConfigurationModel
): Promise<UserResource[]> {
  const group = await GroupResource.fetchByAgentConfiguration({
    auth,
    agentConfiguration: configuration,
  });
  assert(group, "Non-draft agent must have an editor group.");

  return group.getActiveMembers(auth);
}

async function fetchGrantEditors(
  auth: Authenticator,
  agent: AgentResource
): Promise<UserResource[]> {
  assert(agent.id !== null, "Custom agent must have a stable ID.");
  const group = await GroupPermissionResource.findRegularAutoGroupForGrant(
    auth,
    {
      grantType: "editor",
      resourceType: "agent",
      resourceId: agent.id,
    }
  );

  return group ? group.getActiveMembers(auth) : [];
}

async function fetchActiveAuthors(
  auth: Authenticator,
  configuration: AgentConfigurationModel
): Promise<UserResource[]> {
  const versions = await AgentConfigurationModel.findAll({
    attributes: ["authorId"],
    where: {
      agentId: configuration.agentId,
      workspaceId: auth.getNonNullableWorkspace().id,
    },
  });
  const authorIds = [...new Set(versions.map(({ authorId }) => authorId))];
  const authors = await UserResource.fetchByModelIds(authorIds);
  const { memberships } = await MembershipResource.getActiveMemberships({
    users: authors,
    workspace: auth.getNonNullableWorkspace(),
  });
  const activeAuthorIds = new Set(memberships.map(({ userId }) => userId));

  return authors.filter(({ id }) => activeAuthorIds.has(id));
}

async function fetchEditorState(
  auth: Authenticator,
  agent: AgentResource,
  configuration: AgentConfigurationModel
): Promise<EditorState> {
  const [legacyEditors, grantEditors, authors] = await Promise.all([
    fetchLegacyEditors(auth, configuration),
    fetchGrantEditors(auth, agent),
    fetchActiveAuthors(auth, configuration),
  ]);

  return { legacyEditors, grantEditors, authors };
}

async function writeEditorGrants(
  auth: Authenticator,
  agent: AgentResource,
  configuration: AgentConfigurationModel,
  editors: UserResource[],
  { execute, logger, workspace }: BackfillSpec
): Promise<void> {
  if (!execute || editors.length === 0) {
    return;
  }

  await withTransaction(async (transaction) => {
    await agent.grantEditors(auth, {
      editors: editors.map((editor) => editor.toJSON()),
      transaction,
    });
  });
  logger.info(
    {
      workspaceId: workspace.sId,
      agentId: configuration.sId,
      agentStatus: configuration.status,
      editorIds: editors.map(({ sId }) => sId).sort(),
    },
    "Backfilled agent editor grants"
  );
}

function reportEditorMismatch(
  configuration: AgentConfigurationModel,
  state: EditorState,
  { execute, logger, workspace }: BackfillSpec
): number {
  const legacyOnly = userDifference(state.legacyEditors, state.grantEditors);
  const grantOnly = userDifference(state.grantEditors, state.legacyEditors);
  if (legacyOnly.length === 0 && grantOnly.length === 0) {
    return 0;
  }

  logger.warn(
    {
      workspaceId: workspace.sId,
      agentId: configuration.sId,
      agentStatus: configuration.status,
      legacyOnlyEditorIds: legacyOnly.map(({ sId }) => sId).sort(),
      grantOnlyEditorIds: grantOnly.map(({ sId }) => sId).sort(),
    },
    execute
      ? "Agent editor sets differ after grant backfill"
      : "Dry run: agent editor sets differ"
  );
  return 1;
}

function reportMissingAuthors(
  configuration: AgentConfigurationModel,
  state: EditorState,
  { logger, workspace }: BackfillSpec
): number {
  const authorsWithoutGrant = userDifference(state.authors, state.grantEditors);
  if (authorsWithoutGrant.length === 0) {
    return 0;
  }

  logger.warn(
    {
      workspaceId: workspace.sId,
      agentId: configuration.sId,
      agentStatus: configuration.status,
      authorIds: authorsWithoutGrant.map(({ sId }) => sId).sort(),
    },
    "Agent authors are not explicit editors"
  );
  return authorsWithoutGrant.length;
}

async function backfillAgentGrants(
  auth: Authenticator,
  configuration: AgentConfigurationModel,
  spec: BackfillSpec
): Promise<AgentEditorGrantStats> {
  const agent = AgentResource.fromAgentConfigurationModel(configuration);
  const initialState = await fetchEditorState(auth, agent, configuration);
  const missingEditors = userDifference(
    initialState.legacyEditors,
    initialState.grantEditors
  );

  await writeEditorGrants(auth, agent, configuration, missingEditors, spec);
  const finalState = spec.execute
    ? await fetchEditorState(auth, agent, configuration)
    : initialState;

  return {
    agentCount: 1,
    editorGrantsToAdd: missingEditors.length,
    mismatchedAgentCount: reportEditorMismatch(configuration, finalState, spec),
    authorsWithoutGrantCount: reportMissingAuthors(
      configuration,
      finalState,
      spec
    ),
  };
}

function sumStats(agentStats: AgentEditorGrantStats[]): AgentEditorGrantStats {
  return agentStats.reduce<AgentEditorGrantStats>(
    (total, current) => ({
      agentCount: total.agentCount + current.agentCount,
      editorGrantsToAdd: total.editorGrantsToAdd + current.editorGrantsToAdd,
      mismatchedAgentCount:
        total.mismatchedAgentCount + current.mismatchedAgentCount,
      authorsWithoutGrantCount:
        total.authorsWithoutGrantCount + current.authorsWithoutGrantCount,
    }),
    {
      agentCount: 0,
      editorGrantsToAdd: 0,
      mismatchedAgentCount: 0,
      authorsWithoutGrantCount: 0,
    }
  );
}

async function fetchAgentWorkspaceIds(): Promise<ModelId[]> {
  // This one grouped scan is cheaper than constructing auth for every workspace without agents.
  const workspaces = await AgentConfigModel.findAll({
    attributes: ["workspaceId"],
    where: { status: { [Op.ne]: "draft" } },
    group: ["workspaceId"],
    raw: true,
    // WORKSPACE_ISOLATION_BYPASS: This query finds the workspaces the migration must process.
    // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
    dangerouslyBypassWorkspaceIsolationSecurity: true,
  });

  return workspaces.map(({ workspaceId }) => workspaceId);
}

export async function backfillAgentEditorGrants({
  execute,
  logger,
  workspace,
}: BackfillSpec): Promise<AgentEditorGrantStats> {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const agents = await fetchAllAgentsForWorkspace(auth);

  // Each task owns one stable agent ID. grantEditors locks its grant tuple against concurrent live
  // writes.
  const agentStats = await concurrentExecutor(
    agents,
    async (agent) =>
      backfillAgentGrants(auth, agent, { execute, logger, workspace }),
    { concurrency: AGENT_CONCURRENCY }
  );
  const stats = sumStats(agentStats);

  logger.info(
    { workspaceId: workspace.sId, execute, ...stats },
    "Agent editor grant backfill completed for workspace"
  );
  return stats;
}

if (process.argv[1]?.endsWith("20260903_backfill_agent_editor_grants.ts")) {
  makeScript(
    {
      wId: { type: "string", required: false },
      fromWorkspace: {
        type: "number",
        required: false,
        description: "Resume from this numeric workspace model ID",
      },
    },
    async ({ execute, wId, fromWorkspace }, logger) => {
      const where = wId
        ? undefined
        : { id: { [Op.in]: await fetchAgentWorkspaceIds() } };

      await runOnAllWorkspaces(
        async (workspace) => {
          await backfillAgentEditorGrants({ execute, logger, workspace });
        },
        {
          concurrency: WORKSPACE_CONCURRENCY,
          wId,
          fromWorkspaceId: fromWorkspace,
          where,
        }
      );
    }
  );
}
