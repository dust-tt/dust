import { isIncludeResultResourceType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { runIncludeDataRetrieval } from "@app/lib/api/actions/servers/include_data/include_function";
import { buildProjectRetrieveDataSources } from "@app/lib/api/actions/servers/project_manager/helpers";
import { Authenticator } from "@app/lib/auth";
import { extractDocumentTakeaways } from "@app/lib/project_todo/analyze_document";
import { mergeTakeawaysIntoProject } from "@app/lib/project_todo/merge_into_project";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { TakeawaySourceDocument } from "@app/lib/resources/takeaways_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { ConnectorProvider } from "@app/types/data_source";
import type { ProjectTodoSourceType } from "@app/types/project_todo";
import { removeNulls } from "@app/types/shared/utils/general";
// biome-ignore lint/plugin/enforceClientTypesInPublicApi: existing usage
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";

function resultToTakeawaySourceDocument(
  result: any
): TakeawaySourceDocument | null {
  if (isIncludeResultResourceType(result)) {
    let sourceType: ProjectTodoSourceType | null = null;
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

export async function analyzeProjectTodosActivity({
  workspaceId,
  spaceId,
}: {
  workspaceId: string;
  spaceId: string;
}): Promise<void> {
  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    logger.error({ workspaceId }, "Workspace not found");
    return;
  }
  const adminAuth = await Authenticator.internalAdminForWorkspace(workspaceId);

  const space = await SpaceResource.fetchById(adminAuth, spaceId);
  if (!space || !space.isProject()) {
    logger.error({ spaceId }, "Space not found or not a project");
    return;
  }

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
    logger.info(
      { workspaceId, spaceId },
      "No active members on project space; skipping todo analysis"
    );
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
    timeFrame: { duration: 1, unit: "day" },
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

// Called by projectTodoWorkflow. Merges the latest takeaway snapshots
// for all conversations in the project into project_todo rows.
export async function mergeTodosForProjectActivity({
  workspaceId,
  spaceId,
}: {
  workspaceId: string;
  spaceId: string;
}): Promise<void> {
  await mergeTakeawaysIntoProject({ workspaceId, spaceId });
}
