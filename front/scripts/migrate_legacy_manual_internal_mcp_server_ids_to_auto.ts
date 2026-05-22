/**
 * Migrate legacy manual internal MCP server views (random-prefix sIds) to the
 * canonical auto internal MCP server sId (LEGACY_REGION_BIT prefix).
 *
 * Idempotent: re-running on a workspace that was already migrated is a no-op.
 *
 * Usage:
 *   npx tsx scripts/migrate_legacy_manual_internal_mcp_server_ids_to_auto.ts [--execute] [--workspaceId <sId>] [--mcpServerName <name>] [--fromWorkspaceId <id>] [--scanOnly] [--allWorkspaces]
 *
 * By default, only workspaces with legacy random-prefix internal MCP server views
 * are processed (one global DB scan). Pass --allWorkspaces to iterate every workspace.
 * Pass --scanOnly to print affected workspaces without migrating.
 *
 * Without --execute, runs in dry-run mode (reports counts, no writes).
 */

import { autoInternalMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import {
  type AutoInternalMCPServerNameType,
  AVAILABLE_INTERNAL_MCP_SERVER_NAMES,
  INTERNAL_MCP_SERVERS,
  type InternalMCPServerNameType,
  isAutoInternalMCPServerName,
  isInternalMCPServerName,
  matchesInternalMCPServerName,
} from "@app/lib/actions/mcp_internal_actions/constants";
import { Authenticator } from "@app/lib/auth";
import { ConversationMCPServerViewModel } from "@app/lib/models/agent/actions/conversation_mcp_server_view";
import { InternalMCPServerCredentialModel } from "@app/lib/models/agent/actions/internal_mcp_server_credentials";
import { AgentMCPServerConfigurationModel } from "@app/lib/models/agent/actions/mcp";
import { MCPServerConnectionModel } from "@app/lib/models/agent/actions/mcp_server_connection";
import { MCPServerViewModel } from "@app/lib/models/agent/actions/mcp_server_view";
import { RemoteMCPServerToolMetadataModel } from "@app/lib/models/agent/actions/remote_mcp_server_tool_metadata";
import { SkillMCPServerConfigurationModel } from "@app/lib/models/skill";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { UserToolApprovalModel } from "@app/lib/resources/storage/models/user";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import {
  getResourceNameAndIdFromSId,
  LEGACY_REGION_BIT,
  RESOURCES_PREFIX,
} from "@app/lib/resources/string_ids";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { ModelId } from "@app/types/shared/model_id";
import type { LightWorkspaceType } from "@app/types/user";
import type { Logger } from "pino";
import { Op } from "sequelize";
import Sqids from "sqids";

const RESOURCE_S_ID_MIN_LENGTH = 10;

const sqids = new Sqids({
  minLength: RESOURCE_S_ID_MIN_LENGTH,
});

const AUTO_TOOL_ID_TO_NAME = new Map<number, AutoInternalMCPServerNameType>(
  Object.entries(INTERNAL_MCP_SERVERS)
    .filter(([name]) =>
      isAutoInternalMCPServerName(name as InternalMCPServerNameType)
    )
    .map(([name, server]) => [server.id, name as AutoInternalMCPServerNameType])
);

const MCPServerViewModelWithBypass: ModelStaticWorkspaceAware<MCPServerViewModel> =
  MCPServerViewModel;

const SCAN_BATCH_SIZE = 5_000;
const WORKSPACE_FETCH_BATCH_SIZE = 100;
const PROGRESS_BAR_WIDTH = 40;

class ProgressBar {
  private current = 0;

  constructor(
    private readonly label: string,
    private readonly total: number | null = null
  ) {}

  setCurrent(current: number, detail?: string): void {
    this.current = current;
    this.render(detail);
  }

  increment(detail?: string): void {
    this.current += 1;
    this.render(detail);
  }

  finish(detail?: string): void {
    this.render(detail, true);
  }

  private render(detail?: string, finished = false): void {
    const suffix = detail ? ` ${detail}` : "";

    if (!process.stdout.isTTY) {
      if (finished || this.current % 25 === 0) {
        const count = this.total
          ? `${this.current}/${this.total}`
          : String(this.current);
        console.log(`${this.label}: ${count}${suffix}`);
      }
      return;
    }

    const effectiveTotal = this.total ?? Math.max(this.current, 1);
    const ratio = Math.min(1, this.current / effectiveTotal);
    const percent =
      this.total !== null
        ? `${String(Math.round(ratio * 100)).padStart(3)}%`
        : "";
    const filled = Math.max(0, Math.round(ratio * PROGRESS_BAR_WIDTH));
    const bar =
      "=".repeat(Math.max(0, filled - 1)) +
      (filled > 0 ? ">" : "") +
      " ".repeat(Math.max(0, PROGRESS_BAR_WIDTH - filled));
    const countLabel = this.total
      ? `${this.current}/${this.total}`
      : String(this.current);

    process.stdout.write(
      `\r${this.label} [${bar}]${percent ? ` ${percent}` : ""} (${countLabel})${suffix}${finished ? "\n" : ""}`
    );
  }
}

interface WorkspaceMigrationTarget {
  toolName: AutoInternalMCPServerNameType;
  legacySId: string;
}

interface AffectedWorkspaceScanResult {
  workspaceModelId: ModelId;
  targets: WorkspaceMigrationTarget[];
}

function getFirstPrefixFromInternalMCPServerSId(sId: string): number | null {
  const [resourcePrefix, sIdWithoutPrefix] = sId.split("_");
  if (resourcePrefix !== RESOURCES_PREFIX.internal_mcp_server) {
    return null;
  }

  try {
    const ids = sqids.decode(sIdWithoutPrefix);
    if (ids.length !== 4) {
      return null;
    }
    return ids[0];
  } catch {
    return null;
  }
}

function isLegacyRandomPrefixAutoInternalMCPServerSId(
  sId: string,
  workspaceModelId: ModelId,
  allowedToolIds: Set<number>
): AutoInternalMCPServerNameType | null {
  const parsed = getResourceNameAndIdFromSId(sId);
  if (!parsed || parsed.resourceName !== "internal_mcp_server") {
    return null;
  }

  if (parsed.workspaceModelId !== workspaceModelId) {
    return null;
  }

  const toolName = AUTO_TOOL_ID_TO_NAME.get(parsed.resourceModelId);
  if (!toolName || !allowedToolIds.has(parsed.resourceModelId)) {
    return null;
  }

  const firstPrefix = getFirstPrefixFromInternalMCPServerSId(sId);
  if (firstPrefix === null || firstPrefix === LEGACY_REGION_BIT) {
    return null;
  }

  const canonicalSId = autoInternalMCPServerNameToSId({
    name: toolName,
    workspaceId: workspaceModelId,
  });
  if (sId === canonicalSId) {
    return null;
  }

  return toolName;
}

async function scanAffectedWorkspaces(
  toolNames: AutoInternalMCPServerNameType[],
  onProgress?: (progress: {
    scannedViews: number;
    affectedWorkspaces: number;
  }) => void
): Promise<AffectedWorkspaceScanResult[]> {
  const allowedToolIds = new Set<number>(
    toolNames.map((name) => INTERNAL_MCP_SERVERS[name].id)
  );

  const byWorkspace = new Map<
    ModelId,
    Map<AutoInternalMCPServerNameType, string>
  >();

  let lastId = 0;
  let scannedViews = 0;
  while (true) {
    const batch = await MCPServerViewModelWithBypass.findAll({
      attributes: ["id", "workspaceId", "internalMCPServerId"],
      where: {
        serverType: "internal",
        internalMCPServerId: { [Op.ne]: null },
        id: { [Op.gt]: lastId },
      },
      order: [["id", "ASC"]],
      limit: SCAN_BATCH_SIZE,
      raw: true,
      // WORKSPACE_ISOLATION_BYPASS: Global scan to find workspaces with legacy views.
      // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: migration script
      dangerouslyBypassWorkspaceIsolationSecurity: true,
    });

    if (batch.length === 0) {
      break;
    }

    scannedViews += batch.length;

    for (const view of batch) {
      const internalMCPServerId = view.internalMCPServerId;
      if (!internalMCPServerId) {
        continue;
      }

      const toolName = isLegacyRandomPrefixAutoInternalMCPServerSId(
        internalMCPServerId,
        view.workspaceId,
        allowedToolIds
      );
      if (!toolName) {
        continue;
      }

      let targetsByTool = byWorkspace.get(view.workspaceId);
      if (!targetsByTool) {
        targetsByTool = new Map();
        byWorkspace.set(view.workspaceId, targetsByTool);
      }
      targetsByTool.set(toolName, internalMCPServerId);
    }

    onProgress?.({
      scannedViews,
      affectedWorkspaces: byWorkspace.size,
    });

    lastId = batch[batch.length - 1].id;
  }

  return [...byWorkspace.entries()]
    .map(([workspaceModelId, targetsByTool]) => ({
      workspaceModelId,
      targets: [...targetsByTool.entries()].map(
        ([toolName, legacySId]): WorkspaceMigrationTarget => ({
          toolName,
          legacySId,
        })
      ),
    }))
    .sort((a, b) => a.workspaceModelId - b.workspaceModelId);
}

async function fetchViewsByInternalMCPServerId(
  auth: Authenticator,
  internalMCPServerId: string
): Promise<MCPServerViewResource[]> {
  const viewRows = await MCPServerViewModel.findAll({
    attributes: ["id"],
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      serverType: "internal",
      internalMCPServerId,
    },
  });

  if (viewRows.length === 0) {
    return [];
  }

  return MCPServerViewResource.fetchByModelIds(
    auth,
    viewRows.map((view) => view.id),
    { includeMetadata: false }
  );
}

async function findLegacyViewsForTool(
  auth: Authenticator,
  name: InternalMCPServerNameType,
  canonicalSId: string,
  knownLegacySId?: string
): Promise<MCPServerViewResource[]> {
  if (knownLegacySId) {
    return fetchViewsByInternalMCPServerId(auth, knownLegacySId);
  }

  const viewRows = await MCPServerViewModel.findAll({
    attributes: ["id", "internalMCPServerId"],
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      serverType: "internal",
      internalMCPServerId: { [Op.ne]: null },
    },
    raw: true,
  });

  const legacyViewIds = viewRows
    .filter(
      (view) =>
        view.internalMCPServerId !== null &&
        matchesInternalMCPServerName(view.internalMCPServerId, name) &&
        view.internalMCPServerId !== canonicalSId
    )
    .map((view) => view.id);

  if (legacyViewIds.length === 0) {
    return [];
  }

  return MCPServerViewResource.fetchByModelIds(auth, legacyViewIds, {
    includeMetadata: false,
  });
}

async function findCanonicalViewsByVaultId(
  auth: Authenticator,
  canonicalSId: string
): Promise<Map<ModelId, MCPServerViewResource>> {
  return new Map(
    (await fetchViewsByInternalMCPServerId(auth, canonicalSId)).map((view) => [
      view.vaultId,
      view,
    ])
  );
}

async function* iterateWorkspaceBatches(
  workspaceModelIds: ModelId[]
): AsyncGenerator<WorkspaceResource[]> {
  for (
    let i = 0;
    i < workspaceModelIds.length;
    i += WORKSPACE_FETCH_BATCH_SIZE
  ) {
    const batch = workspaceModelIds.slice(i, i + WORKSPACE_FETCH_BATCH_SIZE);
    yield WorkspaceResource.fetchByModelIds(batch);
  }
}

interface MigrationStats {
  legacyViewsFound: number;
  legacyViewsDeleted: number;
  migratedAgentConfigs: number;
  migratedSkillConfigs: number;
  deletedSkillConfigs: number;
  migratedConversationViews: number;
  deletedConversationViews: number;
  migratedConnections: number;
  deletedConnections: number;
  migratedCredentials: number;
  deletedCredentials: number;
  migratedToolMetadata: number;
  deletedToolMetadata: number;
  migratedUserApprovals: number;
  deletedUserApprovals: number;
  skippedMissingDestination: number;
}

function emptyStats(): MigrationStats {
  return {
    legacyViewsFound: 0,
    legacyViewsDeleted: 0,
    migratedAgentConfigs: 0,
    migratedSkillConfigs: 0,
    deletedSkillConfigs: 0,
    migratedConversationViews: 0,
    deletedConversationViews: 0,
    migratedConnections: 0,
    deletedConnections: 0,
    migratedCredentials: 0,
    deletedCredentials: 0,
    migratedToolMetadata: 0,
    deletedToolMetadata: 0,
    migratedUserApprovals: 0,
    deletedUserApprovals: 0,
    skippedMissingDestination: 0,
  };
}

function resolveToolNames(
  mcpServerName?: string
): AutoInternalMCPServerNameType[] {
  if (mcpServerName) {
    if (
      !isInternalMCPServerName(mcpServerName) ||
      !isAutoInternalMCPServerName(mcpServerName)
    ) {
      throw new Error(
        `Invalid MCP server name: ${mcpServerName}. Must be an auto internal tool.`
      );
    }
    return [mcpServerName];
  }

  return AVAILABLE_INTERNAL_MCP_SERVER_NAMES.filter((name) =>
    isAutoInternalMCPServerName(name)
  );
}

async function findLegacyTargetsInWorkspace(
  auth: Authenticator,
  toolNames: AutoInternalMCPServerNameType[]
): Promise<WorkspaceMigrationTarget[]> {
  const workspaceModelId = auth.getNonNullableWorkspace().id;
  const allowedToolIds = new Set<number>(
    toolNames.map((name) => INTERNAL_MCP_SERVERS[name].id)
  );

  const viewRows = await MCPServerViewModel.findAll({
    attributes: ["internalMCPServerId"],
    where: {
      workspaceId: workspaceModelId,
      serverType: "internal",
      internalMCPServerId: { [Op.ne]: null },
    },
    raw: true,
  });

  const targetsByTool = new Map<AutoInternalMCPServerNameType, string>();
  for (const view of viewRows) {
    const internalMCPServerId = view.internalMCPServerId;
    if (!internalMCPServerId) {
      continue;
    }

    const toolName = isLegacyRandomPrefixAutoInternalMCPServerSId(
      internalMCPServerId,
      workspaceModelId,
      allowedToolIds
    );
    if (toolName) {
      targetsByTool.set(toolName, internalMCPServerId);
    }
  }

  return [...targetsByTool.entries()].map(([toolName, legacySId]) => ({
    toolName,
    legacySId,
  }));
}

async function migrateInternalMCPServerIdReferences(
  auth: Authenticator,
  {
    legacySId,
    canonicalSId,
    execute,
    stats,
  }: {
    legacySId: string;
    canonicalSId: string;
    execute: boolean;
    stats: MigrationStats;
  }
): Promise<void> {
  const workspaceId = auth.getNonNullableWorkspace().id;

  const [legacyConnectionCount, canonicalConnections] = await Promise.all([
    MCPServerConnectionModel.count({
      where: {
        workspaceId,
        serverType: "internal",
        internalMCPServerId: legacySId,
      },
    }),
    execute
      ? MCPServerConnectionModel.findAll({
          where: {
            workspaceId,
            serverType: "internal",
            internalMCPServerId: canonicalSId,
          },
        })
      : Promise.resolve([]),
  ]);

  if (!execute) {
    stats.migratedConnections += legacyConnectionCount;
    stats.migratedCredentials += await InternalMCPServerCredentialModel.count({
      where: { workspaceId, internalMCPServerId: legacySId },
    });
    stats.migratedToolMetadata += await RemoteMCPServerToolMetadataModel.count({
      where: { workspaceId, internalMCPServerId: legacySId },
    });
    stats.migratedUserApprovals += await UserToolApprovalModel.count({
      where: { workspaceId, mcpServerId: legacySId },
    });
    return;
  }

  const legacyConnections = await MCPServerConnectionModel.findAll({
    where: {
      workspaceId,
      serverType: "internal",
      internalMCPServerId: legacySId,
    },
  });

  for (const legacyConnection of legacyConnections) {
    const duplicate = canonicalConnections.find(
      (connection) =>
        connection.connectionType === legacyConnection.connectionType &&
        connection.userId === legacyConnection.userId
    );

    if (duplicate) {
      stats.deletedConnections += 1;
      await legacyConnection.destroy();
      continue;
    }

    stats.migratedConnections += 1;
    await legacyConnection.update({ internalMCPServerId: canonicalSId });
  }

  const legacyCredential = await InternalMCPServerCredentialModel.findOne({
    where: { workspaceId, internalMCPServerId: legacySId },
  });
  if (legacyCredential) {
    const canonicalCredential = await InternalMCPServerCredentialModel.findOne({
      where: { workspaceId, internalMCPServerId: canonicalSId },
    });

    if (canonicalCredential) {
      stats.deletedCredentials += 1;
      await legacyCredential.destroy();
    } else {
      stats.migratedCredentials += 1;
      await legacyCredential.update({ internalMCPServerId: canonicalSId });
    }
  }

  const legacyToolMetadata = await RemoteMCPServerToolMetadataModel.findAll({
    where: { workspaceId, internalMCPServerId: legacySId },
  });
  for (const metadata of legacyToolMetadata) {
    const duplicate = await RemoteMCPServerToolMetadataModel.findOne({
      where: {
        workspaceId,
        internalMCPServerId: canonicalSId,
        toolName: metadata.toolName,
      },
    });

    if (duplicate) {
      stats.deletedToolMetadata += 1;
      await metadata.destroy();
      continue;
    }

    stats.migratedToolMetadata += 1;
    await metadata.update({ internalMCPServerId: canonicalSId });
  }

  const legacyApprovals = await UserToolApprovalModel.findAll({
    where: { workspaceId, mcpServerId: legacySId },
  });
  for (const approval of legacyApprovals) {
    const duplicate = await UserToolApprovalModel.findOne({
      where: {
        workspaceId,
        userId: approval.userId,
        mcpServerId: canonicalSId,
        toolName: approval.toolName,
        agentId: approval.agentId,
        argsAndValuesMd5: approval.argsAndValuesMd5,
      },
    });

    if (duplicate) {
      stats.deletedUserApprovals += 1;
      await approval.destroy();
      continue;
    }

    stats.migratedUserApprovals += 1;
    await approval.update({ mcpServerId: canonicalSId });
  }
}

async function migrateViewReferences(
  auth: Authenticator,
  {
    legacyView,
    destinationView,
    canonicalSId,
    execute,
    stats,
  }: {
    legacyView: MCPServerViewResource;
    destinationView: MCPServerViewResource;
    canonicalSId: string;
    execute: boolean;
    stats: MigrationStats;
  }
): Promise<void> {
  const workspaceId = auth.getNonNullableWorkspace().id;

  const agentConfigCount = await AgentMCPServerConfigurationModel.count({
    where: {
      workspaceId,
      mcpServerViewId: legacyView.id,
    },
  });
  stats.migratedAgentConfigs += agentConfigCount;
  if (execute && agentConfigCount > 0) {
    await AgentMCPServerConfigurationModel.update(
      {
        mcpServerViewId: destinationView.id,
        internalMCPServerId: canonicalSId,
      },
      {
        where: {
          workspaceId,
          mcpServerViewId: legacyView.id,
        },
      }
    );
  }

  if (!execute) {
    stats.migratedSkillConfigs += await SkillMCPServerConfigurationModel.count({
      where: {
        workspaceId,
        mcpServerViewId: legacyView.id,
      },
    });
    stats.migratedConversationViews +=
      await ConversationMCPServerViewModel.count({
        where: {
          workspaceId,
          mcpServerViewId: legacyView.id,
        },
      });
    return;
  }

  const skillConfigs = await SkillMCPServerConfigurationModel.findAll({
    where: {
      workspaceId,
      mcpServerViewId: legacyView.id,
    },
  });
  for (const skillConfig of skillConfigs) {
    const duplicate = await SkillMCPServerConfigurationModel.findOne({
      where: {
        workspaceId,
        skillConfigurationId: skillConfig.skillConfigurationId,
        mcpServerViewId: destinationView.id,
      },
    });

    if (duplicate) {
      stats.deletedSkillConfigs += 1;
      await skillConfig.destroy();
      continue;
    }

    stats.migratedSkillConfigs += 1;
    await skillConfig.update({ mcpServerViewId: destinationView.id });
  }

  const conversationViews = await ConversationMCPServerViewModel.findAll({
    where: {
      workspaceId,
      mcpServerViewId: legacyView.id,
    },
  });
  for (const conversationView of conversationViews) {
    const duplicate = await ConversationMCPServerViewModel.findOne({
      where: {
        workspaceId,
        conversationId: conversationView.conversationId,
        mcpServerViewId: destinationView.id,
        userId: conversationView.userId,
        agentConfigurationId: conversationView.agentConfigurationId,
      },
    });

    if (duplicate) {
      stats.deletedConversationViews += 1;
      await conversationView.destroy();
      continue;
    }

    stats.migratedConversationViews += 1;
    await conversationView.update({ mcpServerViewId: destinationView.id });
  }
}

async function deleteLegacyView(
  auth: Authenticator,
  legacyView: MCPServerViewResource,
  execute: boolean
): Promise<void> {
  if (!execute) {
    return;
  }

  const deleteResult = await legacyView.hardDelete(auth);
  if (deleteResult.isErr()) {
    throw deleteResult.error;
  }
}

async function migrateWorkspace(
  workspace: LightWorkspaceType,
  {
    targets,
    toolNames,
    execute,
  }: {
    targets?: WorkspaceMigrationTarget[];
    toolNames: AutoInternalMCPServerNameType[];
    execute: boolean;
  },
  logger: Logger
): Promise<MigrationStats> {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const stats = emptyStats();

  if (execute) {
    await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);
  }

  const migrationTargets =
    targets ?? (await findLegacyTargetsInWorkspace(auth, toolNames));

  for (const target of migrationTargets) {
    const { toolName: name, legacySId: knownLegacySId } = target;
    const canonicalSId = autoInternalMCPServerNameToSId({
      name,
      workspaceId: auth.getNonNullableWorkspace().id,
    });

    const legacyViews = await findLegacyViewsForTool(
      auth,
      name,
      canonicalSId,
      knownLegacySId
    );
    if (legacyViews.length === 0) {
      continue;
    }

    stats.legacyViewsFound += legacyViews.length;

    const canonicalViewsByVaultId = await findCanonicalViewsByVaultId(
      auth,
      canonicalSId
    );

    const legacySId = legacyViews[0].internalMCPServerId;
    if (!legacySId) {
      continue;
    }

    logger.info(
      {
        workspaceId: workspace.sId,
        mcpServerName: name,
        legacySId,
        canonicalSId,
        legacyViewCount: legacyViews.length,
      },
      execute
        ? "Migrating legacy internal MCP server IDs to auto IDs"
        : "Dry run: would migrate legacy internal MCP server IDs to auto IDs"
    );

    await migrateInternalMCPServerIdReferences(auth, {
      legacySId,
      canonicalSId,
      execute,
      stats,
    });

    for (const legacyView of legacyViews) {
      const destinationView = canonicalViewsByVaultId.get(legacyView.vaultId);
      if (!destinationView) {
        stats.skippedMissingDestination += 1;
        logger.warn(
          {
            workspaceId: workspace.sId,
            mcpServerName: name,
            legacyViewId: legacyView.id,
            vaultId: legacyView.vaultId,
            canonicalSId,
          },
          "No canonical MCP server view found in the same space; skipping legacy view"
        );
        continue;
      }

      await migrateViewReferences(auth, {
        legacyView,
        destinationView,
        canonicalSId,
        execute,
        stats,
      });

      await deleteLegacyView(auth, legacyView, execute);
      stats.legacyViewsDeleted += 1;
    }
  }

  return stats;
}

function addStats(total: MigrationStats, delta: MigrationStats): void {
  for (const key of Object.keys(total) as (keyof MigrationStats)[]) {
    total[key] += delta[key];
  }
}

makeScript(
  {
    workspaceId: {
      type: "string",
      description: "Optional workspace sId to run on a single workspace",
    },
    mcpServerName: {
      type: "string",
      description:
        "Optional auto internal MCP server name. If omitted, all auto tools are checked.",
    },
    fromWorkspaceId: {
      type: "number",
      description: "Resume from this workspace model id (inclusive).",
    },
    scanOnly: {
      type: "boolean",
      description:
        "Only scan for affected workspaces and print them; do not migrate.",
      default: false,
    },
    allWorkspaces: {
      type: "boolean",
      description:
        "Process every workspace instead of only those with legacy views.",
      default: false,
    },
  },
  async (
    {
      workspaceId,
      mcpServerName,
      fromWorkspaceId,
      scanOnly,
      allWorkspaces,
      execute,
    },
    logger
  ) => {
    const toolNames = resolveToolNames(mcpServerName);
    const totalStats = emptyStats();
    const failedWorkspaces: { sId: string; name: string; error: string }[] = [];

    const processWorkspace = async (
      workspace: LightWorkspaceType,
      targets?: WorkspaceMigrationTarget[]
    ) => {
      try {
        const stats = await migrateWorkspace(
          workspace,
          { toolNames, targets, execute },
          logger
        );
        addStats(totalStats, stats);

        if (stats.legacyViewsFound > 0) {
          logger.info(
            { workspaceId: workspace.sId, ...stats },
            execute
              ? "Migrated workspace legacy internal MCP server IDs"
              : "Dry run: workspace has legacy internal MCP server IDs"
          );
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        logger.error(
          { workspaceId: workspace.sId, error: errorMessage },
          "Failed to migrate workspace"
        );
        failedWorkspaces.push({
          sId: workspace.sId,
          name: workspace.name,
          error: errorMessage,
        });
      }
    };

    if (workspaceId) {
      const workspace = await WorkspaceResource.fetchById(workspaceId);
      if (!workspace) {
        throw new Error(`Workspace not found: ${workspaceId}`);
      }
      const progressBar = new ProgressBar("Processing workspace", 1);
      await processWorkspace(renderLightWorkspaceType({ workspace }));
      progressBar.finish(workspace.sId);
    } else if (allWorkspaces) {
      const workspaceModelIds = (
        await WorkspaceResource.listAllModelIds("ASC")
      ).filter((id) => !fromWorkspaceId || id >= fromWorkspaceId);
      const progressBar = new ProgressBar(
        "Processing workspaces",
        workspaceModelIds.length
      );
      let processedWorkspaces = 0;

      await runOnAllWorkspaces(
        async (workspace) => {
          await processWorkspace(workspace);
          processedWorkspaces += 1;
          progressBar.setCurrent(processedWorkspaces, workspace.sId);
        },
        { fromWorkspaceId }
      );
      progressBar.finish();
    } else {
      const scanProgressBar = new ProgressBar("Scanning internal MCP views");
      const affected = await scanAffectedWorkspaces(toolNames, (progress) => {
        scanProgressBar.setCurrent(
          progress.scannedViews,
          `${progress.affectedWorkspaces} affected`
        );
      });
      scanProgressBar.finish(`${affected.length} affected workspaces`);
      const filteredAffected = fromWorkspaceId
        ? affected.filter((entry) => entry.workspaceModelId >= fromWorkspaceId)
        : affected;

      logger.info(
        {
          affectedWorkspaceCount: filteredAffected.length,
          totalLegacyTargets: filteredAffected.reduce(
            (sum, entry) => sum + entry.targets.length,
            0
          ),
        },
        scanOnly
          ? "Scan complete for legacy internal MCP server IDs"
          : "Found affected workspaces; starting targeted migration"
      );

      if (scanOnly) {
        console.log("\n=== Affected Workspaces Scan ===");
        console.log(
          `Tools checked: ${toolNames.length}${
            mcpServerName ? ` (${mcpServerName})` : ""
          }`
        );
        console.log(`Affected workspaces: ${filteredAffected.length}\n`);

        if (filteredAffected.length === 0) {
          console.log("No affected workspaces found.");
        } else {
          const entryByModelId = new Map(
            filteredAffected.map((entry) => [entry.workspaceModelId, entry])
          );

          for await (const batch of iterateWorkspaceBatches([
            ...entryByModelId.keys(),
          ])) {
            for (const workspace of batch) {
              const entry = entryByModelId.get(workspace.id);
              if (!entry) {
                continue;
              }
              const toolNamesForEntry = entry.targets.map(
                (target) => target.toolName
              );
              const legacySIds = entry.targets.map(
                (target) => target.legacySId
              );
              console.log(
                `- ${workspace.sId} (${workspace.name}): tools=[${toolNamesForEntry.join(", ")}] legacySIds=[${legacySIds.join(", ")}]`
              );
            }
          }
        }

        console.log("");
        return;
      }

      const entryByModelId = new Map(
        filteredAffected.map((entry) => [entry.workspaceModelId, entry])
      );
      const migrateProgressBar = new ProgressBar(
        "Migrating workspaces",
        entryByModelId.size
      );
      let processedWorkspaces = 0;

      for await (const batch of iterateWorkspaceBatches([
        ...entryByModelId.keys(),
      ])) {
        for (const workspace of batch) {
          const entry = entryByModelId.get(workspace.id);
          if (!entry) {
            continue;
          }

          await processWorkspace(
            renderLightWorkspaceType({ workspace }),
            entry.targets
          );
          processedWorkspaces += 1;
          migrateProgressBar.setCurrent(processedWorkspaces, workspace.sId);
        }
      }
      migrateProgressBar.finish();
    }

    console.log("\n=== Legacy Internal MCP Server ID Migration Report ===");
    console.log(
      `Tools checked: ${toolNames.length}${
        mcpServerName ? ` (${mcpServerName})` : ""
      }`
    );
    console.log(`Legacy views found: ${totalStats.legacyViewsFound}`);
    console.log(`Legacy views deleted: ${totalStats.legacyViewsDeleted}`);
    console.log(
      `Agent MCP configs migrated: ${totalStats.migratedAgentConfigs}`
    );
    console.log(
      `Skill MCP configs migrated: ${totalStats.migratedSkillConfigs}`
    );
    console.log(
      `Skill MCP configs deleted (duplicate): ${totalStats.deletedSkillConfigs}`
    );
    console.log(
      `Conversation MCP views migrated: ${totalStats.migratedConversationViews}`
    );
    console.log(
      `Conversation MCP views deleted (duplicate): ${totalStats.deletedConversationViews}`
    );
    console.log(`Connections migrated: ${totalStats.migratedConnections}`);
    console.log(
      `Connections deleted (duplicate): ${totalStats.deletedConnections}`
    );
    console.log(`Credentials migrated: ${totalStats.migratedCredentials}`);
    console.log(
      `Credentials deleted (duplicate): ${totalStats.deletedCredentials}`
    );
    console.log(`Tool metadata migrated: ${totalStats.migratedToolMetadata}`);
    console.log(
      `Tool metadata deleted (duplicate): ${totalStats.deletedToolMetadata}`
    );
    console.log(`User approvals migrated: ${totalStats.migratedUserApprovals}`);
    console.log(
      `User approvals deleted (duplicate): ${totalStats.deletedUserApprovals}`
    );
    console.log(
      `Legacy views skipped (missing destination): ${totalStats.skippedMissingDestination}`
    );

    if (failedWorkspaces.length > 0) {
      console.log("\nFailed workspaces:");
      for (const workspace of failedWorkspaces) {
        console.log(
          `- ${workspace.sId} (${workspace.name}): ${workspace.error}`
        );
      }
    }

    console.log(
      `\nSummary: ${totalStats.legacyViewsDeleted} legacy views ${
        execute ? "migrated" : "would be migrated"
      }, ${failedWorkspaces.length} failed\n`
    );
  }
);
