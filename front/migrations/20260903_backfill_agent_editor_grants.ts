import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
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
import { col, fn, Op } from "sequelize";

const AGENT_CONCURRENCY = 8;
const WORKSPACE_CONCURRENCY = 4;

const AgentConfigModel: ModelStaticWorkspaceAware<AgentConfigurationModel> =
  AgentConfigurationModel;

type EditorState = {
  legacyEditors: UserResource[];
  grantEditors: UserResource[];
};

type EditorChanges = {
  toAdd: UserResource[];
  toRemove: UserResource[];
};

type BackfillSpec = {
  execute: boolean;
  logger: Logger;
  workspace: LightWorkspaceType;
};

export type AgentEditorGrantStats = {
  agentCount: number;
  editorGrantsToAdd: number;
  editorGrantsToRemove: number;
  mismatchedAgentCount: number;
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

async function fetchEditorState(
  auth: Authenticator,
  agent: AgentResource,
  configuration: AgentConfigurationModel
): Promise<EditorState> {
  const [legacyEditors, grantEditors] = await Promise.all([
    fetchLegacyEditors(auth, configuration),
    fetchGrantEditors(auth, agent),
  ]);

  return { legacyEditors, grantEditors };
}

async function syncEditorGrants(
  auth: Authenticator,
  agent: AgentResource,
  configuration: AgentConfigurationModel,
  { toAdd, toRemove }: EditorChanges,
  { execute, logger, workspace }: BackfillSpec
): Promise<void> {
  if (!execute || (toAdd.length === 0 && toRemove.length === 0)) {
    return;
  }

  await withTransaction(async (transaction) => {
    await agent.grantEditors(auth, {
      editors: toAdd.map((editor) => editor.toJSON()),
      transaction,
    });
    await agent.revokeEditors(auth, {
      editors: toRemove.map((editor) => editor.toJSON()),
      transaction,
    });
  });
  logger.info(
    {
      workspaceId: workspace.sId,
      agentId: configuration.sId,
      agentStatus: configuration.status,
      addedEditorIds: toAdd.map(({ sId }) => sId).sort(),
      removedEditorIds: toRemove.map(({ sId }) => sId).sort(),
    },
    "Synchronized agent editor grants"
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

async function backfillAgentGrants(
  auth: Authenticator,
  configuration: AgentConfigurationModel,
  spec: BackfillSpec
): Promise<AgentEditorGrantStats> {
  const agent = AgentResource.fromAgentConfigurationModel(configuration);
  const initialState = await fetchEditorState(auth, agent, configuration);
  const changes = {
    toAdd: userDifference(
      initialState.legacyEditors,
      initialState.grantEditors
    ),
    toRemove: userDifference(
      initialState.grantEditors,
      initialState.legacyEditors
    ),
  };

  await syncEditorGrants(auth, agent, configuration, changes, spec);
  const hasChanges = changes.toAdd.length > 0 || changes.toRemove.length > 0;
  const finalState =
    spec.execute && hasChanges
      ? await fetchEditorState(auth, agent, configuration)
      : initialState;

  return {
    agentCount: 1,
    editorGrantsToAdd: changes.toAdd.length,
    editorGrantsToRemove: changes.toRemove.length,
    mismatchedAgentCount: reportEditorMismatch(configuration, finalState, spec),
  };
}

function sumStats(agentStats: AgentEditorGrantStats[]): AgentEditorGrantStats {
  return agentStats.reduce<AgentEditorGrantStats>(
    (total, current) => ({
      agentCount: total.agentCount + current.agentCount,
      editorGrantsToAdd: total.editorGrantsToAdd + current.editorGrantsToAdd,
      editorGrantsToRemove:
        total.editorGrantsToRemove + current.editorGrantsToRemove,
      mismatchedAgentCount:
        total.mismatchedAgentCount + current.mismatchedAgentCount,
    }),
    {
      agentCount: 0,
      editorGrantsToAdd: 0,
      editorGrantsToRemove: 0,
      mismatchedAgentCount: 0,
    }
  );
}

async function fetchAgentHeads(
  auth: Authenticator
): Promise<AgentConfigurationModel[]> {
  const workspaceId = auth.getNonNullableWorkspace().id;
  const latestVersions = await AgentConfigurationModel.findAll({
    attributes: ["agentId", [fn("MAX", col("version")), "version"]],
    where: { workspaceId, status: { [Op.ne]: "draft" } },
    group: ["agentId"],
  });
  if (latestVersions.length === 0) {
    return [];
  }

  // The largest workspace has about 17k agents, which keeps this lookup bounded.
  return AgentConfigurationModel.findAll({
    where: {
      workspaceId,
      [Op.or]: latestVersions.map(({ agentId, version }) => ({
        agentId,
        version,
      })),
    },
  });
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
  const configurations = await fetchAgentHeads(auth);

  // Each task owns one stable agent ID. Grant mutations lock their tuple against concurrent writes.
  const agentStats = await concurrentExecutor(
    configurations,
    async (configuration) =>
      backfillAgentGrants(auth, configuration, {
        execute,
        logger,
        workspace,
      }),
    { concurrency: AGENT_CONCURRENCY }
  );
  const stats = sumStats(agentStats);

  logger.info(
    { workspaceId: workspace.sId, execute, ...stats },
    "Agent editor grant backfill completed for workspace"
  );
  return stats;
}

// Importing this module in the migration test must not start the CLI or call process.exit.
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

      logger.info(
        execute
          ? "Agent editor grant backfill completed"
          : "Agent editor grant backfill dry run completed"
      );
    }
  );
}
