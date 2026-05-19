import { isIncludeResultResourceType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { runIncludeDataRetrieval } from "@app/lib/api/actions/servers/include_data/include_function";
import { buildProjectRetrieveDataSources } from "@app/lib/api/actions/servers/pod_manager/helpers";
import { Authenticator } from "@app/lib/auth";
import { extractDocumentTakeaways } from "@app/lib/project_task/analyze_document";
import { isInitialTaskSyncLookback } from "@app/lib/project_task/analyze_document/types";
import { mergeTakeawaysIntoProject } from "@app/lib/project_task/merge_into_project";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { TakeawaySourceDocument } from "@app/lib/resources/takeaways_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { ConnectorProvider } from "@app/types/data_source";
import type { ProjectTaskSourceType } from "@app/types/project_task";
import { Err, type Result } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import type { TimeFrame } from "@app/types/shared/utils/time_frame";
// biome-ignore lint/plugin/enforceClientTypesInPublicApi: existing usage
import { INTERNAL_MIME_TYPES, Ok } from "@dust-tt/client";

function resultToTakeawaySourceDocument(
  result: any
): TakeawaySourceDocument | null {
  if (isIncludeResultResourceType(result)) {
    let sourceType: ProjectTaskSourceType | null = null;
    switch (result.resource.source.provider as ConnectorProvider) {
      case "dust_project":
        sourceType =
          result.resource.source.mimeType ===
          INTERNAL_MIME_TYPES.DUST_PROJECT.CONVERSATION_MESSAGES
            ? "project_conversation"
            : "project_knowledge";
        break;
      case "slack":
      case "slack_bot":
        sourceType = "slack";
        break;
      case "google_drive":
        sourceType = "gdrive";
        break;
      case "notion":
        sourceType = "notion";
        break;
      case "confluence":
        sourceType = "confluence";
        break;
      case "github":
        sourceType = "github";
        break;
      case "microsoft":
        sourceType = "microsoft";
        break;
      default:
        logger.info(
          {
            provider: result.resource.source.provider,
            mimeType: result.resource.source.mimeType,
          },
          "[resultToTakeawaySourceDocument] Unknown provider"
        );
        return null;
    }

    if (!sourceType) {
      return null;
    }

    return {
      title: result.resource.text,
      id: result.resource.id,
      type: sourceType,
      uri: result.resource.uri,
      text: result.resource.chunks.join("\n"),
    };
  }
  return null;
}

async function resolveProjectTaskContext({
  workspaceId,
  spaceId,
  localLogger,
}: {
  workspaceId: string;
  spaceId: string;
  localLogger: typeof logger;
}): Promise<
  Result<
    {
      space: SpaceResource;
      adminAuth: Authenticator;
      metadata: ProjectMetadataResource;
    },
    boolean
  >
> {
  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    localLogger.error("Workspace not found");
    return new Err(false);
  }

  const adminAuth = await Authenticator.internalAdminForWorkspace(workspaceId);
  const space = await SpaceResource.fetchById(adminAuth, spaceId);
  if (!space || !space.isProject()) {
    localLogger.error("Space not found or not a project");
    return new Err(false);
  }

  const metadata = await ProjectMetadataResource.fetchBySpace(adminAuth, space);
  if (!metadata?.todoGenerationEnabled) {
    localLogger.info(
      "Todo generation is disabled or not configured for this project; skipping project todo merge"
    );
    return new Err(false);
  }

  return new Ok({ space, adminAuth, metadata });
}

export async function analyzeProjectTodosActivity({
  workspaceId,
  spaceId,
  runId,
}: {
  workspaceId: string;
  spaceId: string;
  runId: string;
}): Promise<void> {
  const startMs = Date.now();
  const localLogger = logger.child({ workspaceId, spaceId, runId });

  localLogger.info("Starting project todo analysis");

  const checkResult = await resolveProjectTaskContext({
    workspaceId,
    spaceId,
    localLogger,
  });
  if (checkResult.isErr()) {
    return;
  }

  const { space, adminAuth, metadata } = checkResult.value;

  const { groupsToProcess } =
    await space.fetchManualGroupsMemberships(adminAuth);

  // We only need a valid member that has "read" permissions on the project.
  // Iterate groups (rather than relying on GroupMembershipModel rows alone) so
  // we also pick up members from groups whose membership is resolved at read
  // time (e.g. the global group on non-restricted projects).
  let member: UserResource | undefined;
  for (const group of groupsToProcess) {
    const members = await group.getActiveMembers(adminAuth);
    if (members.length > 0) {
      member = members[0];
      break;
    }
  }

  if (!member) {
    localLogger.info(
      "No active members on project space; skipping todo analysis"
    );
    return;
  }

  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    member.sId,
    workspaceId
  );
  if (!auth) {
    localLogger.error("Failed to create authenticator for project member");
    return;
  }

  let timeFrame: TimeFrame | undefined = { duration: 1, unit: "day" }; // Default when no prior run and no first-sync hint
  if (metadata.lastTodoAnalysisAt) {
    const deltaMs = Date.now() - metadata.lastTodoAnalysisAt.getTime();
    const MS_PER_HOUR = 1000 * 60 * 60;
    timeFrame = { duration: deltaMs / MS_PER_HOUR, unit: "hour" };
  } else if (
    metadata.initialTodoAnalysisLookback &&
    isInitialTaskSyncLookback(metadata.initialTodoAnalysisLookback)
  ) {
    switch (metadata.initialTodoAnalysisLookback) {
      case "now":
        timeFrame = { duration: 1, unit: "hour" };
        break;
      case "last_24h":
        timeFrame = { duration: 24, unit: "hour" };
        break;
      case "max":
        timeFrame = undefined;
        break;
    }
  }

  const dataSources = await buildProjectRetrieveDataSources(auth, {
    space,
    // Only include group conversations and connected data.
    // Goal is to reduce noise by not generating TODOs for purely agentic conversations or files that might be the output of agentic conversations.
    // If one wants to have more sophisticated TODOs lifecycle management, they can do it via custom agents.
    onlyGroupConversationsAndConnectedData: true,
  });

  // Fetch all recent documents changes from the project knowledge and conversations.
  const results = await runIncludeDataRetrieval(auth, {
    citationsOffset: 0,
    retrievalTopK: 128,
    dataSources,
    timeFrame,
  });

  if (results.isErr()) {
    localLogger.error(
      { dataSources, error: results.error },
      "Failed to retrieve include data"
    );
    return;
  }

  const documentsLastFetchedAt = new Date();

  const documents = removeNulls(
    results.value.map((result) => resultToTakeawaySourceDocument(result))
  );

  const stats = {
    documentsFound: documents.length,
    documentsAnalyzed: 0,
    documentsFailed: 0,
    actionItemsExtracted: 0,
  };

  await concurrentExecutor(
    documents,
    async (document) => {
      const result = await extractDocumentTakeaways(auth, {
        localLogger,
        runId,
        spaceId,
        document,
      });
      if (result) {
        stats.documentsAnalyzed++;
        stats.actionItemsExtracted += result.actionItems;
      } else {
        stats.documentsFailed++;
      }
    },
    { concurrency: 10 }
  );

  localLogger.info(
    {
      phase: "analyze",
      ...stats,
      documentsLastFetchedAt,
      durationMs: Date.now() - startMs,
    },
    "Project todo analysis complete"
  );

  await metadata.recordTodoAnalysisComplete(documentsLastFetchedAt);
}

// Called by projectTodoWorkflow. Merges the latest takeaway snapshots
// for all conversations in the project into project_todo rows.
export async function mergeTasksForProjectActivity({
  workspaceId,
  spaceId,
  runId,
}: {
  workspaceId: string;
  spaceId: string;
  runId: string;
}): Promise<void> {
  const startMs = Date.now();
  const localLogger = logger.child({ workspaceId, spaceId, runId });

  localLogger.info("Starting merge of project todo takeaways");

  const checkResult = await resolveProjectTaskContext({
    workspaceId,
    spaceId,
    localLogger,
  });
  if (checkResult.isErr()) {
    return;
  }

  const stats = await mergeTakeawaysIntoProject({
    localLogger,
    runId,
    space: checkResult.value.space,
    adminAuth: checkResult.value.adminAuth,
  });

  localLogger.info(
    { phase: "merge", ...stats, durationMs: Date.now() - startMs },
    "Project todo merge complete"
  );
}
