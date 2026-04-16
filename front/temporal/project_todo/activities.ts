import { isIncludeResultResourceType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { runIncludeDataRetrieval } from "@app/lib/api/actions/servers/include_data/include_function";
import { buildProjectRetrieveDataSources } from "@app/lib/api/actions/servers/project_manager/helpers";
import { Authenticator } from "@app/lib/auth";
import { extractDocumentTakeaways } from "@app/lib/project_todo/analyze_conversation";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { TakeawaySourceDocument } from "@app/lib/resources/takeaways_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { signalOrStartProjectMergeWorkflow } from "@app/temporal/project_todo/client";
import type { ProjectTodoSourceType } from "@app/types/project_todo";
import { removeNulls } from "@app/types/shared/utils/general";
// biome-ignore lint/plugin/enforceClientTypesInPublicApi: existing usage
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";

function resultToTakeawaySourceDocument(
  result: any
): TakeawaySourceDocument | null {
  if (isIncludeResultResourceType(result)) {
    let sourceType: ProjectTodoSourceType | null = null;
    switch (result.resource.source.provider) {
      case "dust_project":
        sourceType =
          result.resource.source.mimeType ===
          INTERNAL_MIME_TYPES.DUST_PROJECT.CONVERSATION_MESSAGES
            ? "project_conversation"
            : "project_knowledge";
        break;
      default:
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

export async function analyzeProjectTodosActivity({
  workspaceId,
  spaceId,
}: {
  workspaceId: string;
  spaceId: string;
}): Promise<void> {
  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    logger.error({ spaceId }, "Workspace not found");
    return;
  }
  const adminAuth = await Authenticator.internalAdminForWorkspace(workspaceId);

  const space = await SpaceResource.fetchById(adminAuth, spaceId);
  if (!space || !space.isProject()) {
    logger.error({ spaceId }, "Space not found or not a project");
    return;
  }

  const r = await space.fetchManualGroupsMemberships(adminAuth);

  // We only need a valid member that has "read" permissions on the project.
  const member = await UserResource.fetchByModelId(
    r.allGroupMemberships[0].userId
  );
  if (!member) {
    logger.error({ spaceId }, "Member not found");
    return;
  }

  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    member.sId,
    workspaceId
  );
  if (!auth) {
    logger.error(
      { spaceId },
      "Failed to create authenticator for project member"
    );
    return;
  }

  // Fetch all recent documents changes from the project knowledge and conversations.
  const results = await runIncludeDataRetrieval(auth, {
    citationsOffset: 0,
    retrievalTopK: 128,
    dataSources: await buildProjectRetrieveDataSources(auth, space),
    // TODO: compute this from the last time the project todo was analyzed.
    timeFrame: { duration: 7, unit: "day" },
  });

  if (results.isErr()) {
    logger.error(
      { spaceId, error: results.error },
      "Failed to retrieve include data"
    );
    return;
  }

  const documents = removeNulls(
    results.value.map((result) => resultToTakeawaySourceDocument(result))
  );

  for (const document of documents) {
    logger.info(
      {
        id: document.id,
        title: document.title,
        text: document.text,
        type: document.type,
        uri: document.uri,
      },
      "Document"
    );
  }

  await concurrentExecutor(
    documents,
    async (document) => {
      await extractDocumentTakeaways(auth, {
        spaceId,
        document,
      });
    },
    { concurrency: 10 }
  );
}

// Starts or signals `projectMergeWorkflow` (signalWithStart). Used when merge is driven
// via signals; the cron `projectTodoWorkflow` path calls `mergeTodosForProjectActivity` directly.
export async function signalOrStartMergeWorkflowActivity({
  workspaceId,
  spaceId,
}: {
  workspaceId: string;
  spaceId: string;
}): Promise<void> {
  await signalOrStartProjectMergeWorkflow({ workspaceId, spaceId });
}

// Called by projectMergeWorkflow. Merges the latest takeaway snapshots
// for all conversations in the project into project_todo rows.
export async function mergeTodosForProjectActivity({
  workspaceId,
  spaceId,
}: {
  workspaceId: string;
  spaceId: string;
}): Promise<void> {
  /*
  const authResult = await Authenticator.fromJSON(authType);
  if (authResult.isErr()) {
    logger.error(
      { spaceId, error: authResult.error },
      "Project todo merge: failed to deserialize authenticator"
    );
    return;
  }

  const auth = authResult.value;

  logger.info(
    { spaceId, workspaceId: auth.getNonNullableWorkspace().sId },
    "Project todo merge: activity invoked (not yet implemented)"
  );

  await mergeTakeawaysIntoProject(auth, { spaceId });
  */
}
