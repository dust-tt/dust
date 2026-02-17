import { getWorkOS } from "@app/lib/api/workos/client";
import type { CustomAttributeKey } from "@app/lib/iam/users";
import {
  CUSTOM_ATTRIBUTES_TO_SYNC,
  syncCustomAttributesToUserMetadata,
} from "@app/lib/iam/users";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";
import type {
  AutoPaginatable,
  DefaultCustomAttributes,
  Directory,
  DirectoryUserWithGroups,
} from "@workos-inc/node";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// Extracts WorkOS custom attributes from DirectoryUser.
function extractCustomAttributes(
  directoryUser: DirectoryUserWithGroups<DefaultCustomAttributes>
): Record<CustomAttributeKey, string | null> {
  const result: Record<CustomAttributeKey, string | null> = {
    job_title: null,
    department_name: null,
  };

  const { customAttributes } = directoryUser;
  if (isRecord(customAttributes)) {
    for (const attr of CUSTOM_ATTRIBUTES_TO_SYNC) {
      const value = customAttributes[attr];
      if (typeof value === "string" && value.trim() !== "") {
        result[attr] = value.trim();
      }
    }
  }

  return result;
}

// Fetches all directories from WorkOS with pagination.
async function getAllDirectories(): Promise<Directory[]> {
  const workOS = getWorkOS();
  const directories: Directory[] = [];
  let after: string | undefined = undefined;

  do {
    const response: AutoPaginatable<Directory> =
      await workOS.directorySync.listDirectories({
        ...(after && { after }),
      });
    directories.push(...response.data);
    after = response.listMetadata?.after;
  } while (after);

  return directories;
}

// Fetches all users from a WorkOS directory with pagination.
async function getDirectoryUsers(
  directoryId: string
): Promise<DirectoryUserWithGroups<DefaultCustomAttributes>[]> {
  const workOS = getWorkOS();
  const directoryUsers: DirectoryUserWithGroups<DefaultCustomAttributes>[] = [];
  let after: string | undefined = undefined;

  do {
    const response: AutoPaginatable<
      DirectoryUserWithGroups<DefaultCustomAttributes>
    > = await workOS.directorySync.listUsers({
      directory: directoryId,
      ...(after && { after }),
    });
    directoryUsers.push(...response.data);
    after = response.listMetadata?.after;
  } while (after);

  return directoryUsers;
}

makeScript(
  {
    workspaceId: {
      alias: "w",
      type: "string",
      description:
        "Optional: Specific workspace sID to process. If not provided, processes all SCIM-enabled workspaces.",
    },
  },
  async ({ execute, workspaceId }, logger) => {
    // Fetch all directories from WorkOS (much more efficient than querying all workspaces).
    const allDirectories = await getAllDirectories();

    logger.info(
      { directoryCount: allDirectories.length },
      "Fetched all directories from WorkOS"
    );

    let totalUsersProcessed = 0;
    let totalUsersUpdated = 0;
    let totalWorkspacesProcessed = 0;

    for (const directory of allDirectories) {
      if (!directory.organizationId) {
        logger.warn(
          { directoryId: directory.id, directoryName: directory.name },
          "Directory has no organization ID, skipping"
        );
        continue;
      }

      // Find workspace by WorkOS organization ID.
      const workspace = await WorkspaceResource.fetchByWorkOSOrganizationId(
        directory.organizationId
      );

      if (!workspace) {
        logger.warn(
          {
            directoryId: directory.id,
            organizationId: directory.organizationId,
          },
          "No workspace found for directory organization"
        );
        continue;
      }

      // If a specific workspace was requested, skip others.
      if (workspaceId && workspace.sId !== workspaceId) {
        continue;
      }

      const lightWorkspace = renderLightWorkspaceType({ workspace });

      totalWorkspacesProcessed++;

      logger.info(
        {
          workspaceSId: workspace.sId,
          workspaceName: workspace.name,
          directoryId: directory.id,
          directoryName: directory.name,
        },
        "Processing directory"
      );

      // Fetch all users from the directory.
      const directoryUsers = await getDirectoryUsers(directory.id);

      logger.info(
        {
          workspaceSId: workspace.sId,
          directoryId: directory.id,
          userCount: directoryUsers.length,
        },
        "Fetched users from directory"
      );

      // Process each directory user.
      const results = await concurrentExecutor(
        directoryUsers,
        async (directoryUser) => {
          if (!directoryUser.email) {
            return { skipped: true, reason: "no_email" };
          }

          // Find the Dust user by WorkOS user ID first, fallback to email.
          const userByWorkOSId = directoryUser.idpId
            ? await UserResource.fetchByWorkOSUserId(directoryUser.idpId)
            : null;
          const user =
            userByWorkOSId ??
            (await UserResource.fetchByEmail(
              directoryUser.email.toLowerCase()
            ));

          if (!user) {
            return {
              skipped: true,
              reason: "user_not_found",
              email: directoryUser.email,
            };
          }

          // Extract custom attributes.
          const customAttributes = extractCustomAttributes(directoryUser);

          // Check if there's any attribute to sync.
          const hasAttributes = Object.values(customAttributes).some(
            (v) => v !== null
          );

          if (!hasAttributes) {
            return {
              skipped: true,
              reason: "no_attributes",
              email: directoryUser.email,
            };
          }

          if (execute) {
            await syncCustomAttributesToUserMetadata(
              user,
              lightWorkspace,
              customAttributes
            );
          } else {
            logger.info({
              workspaceId: workspace.sId,
              userId: user.sId,
              email: directoryUser.email,
              customAttributes,
            });
          }

          return {
            updated: true,
            email: directoryUser.email,
            userId: user.sId,
            attributes: customAttributes,
          };
        },
        { concurrency: 10 }
      );

      const updated = results.filter((r) => "updated" in r && r.updated).length;
      const skipped = results.filter((r) => "skipped" in r && r.skipped);

      totalUsersProcessed += directoryUsers.length;
      totalUsersUpdated += updated;

      logger.info(
        {
          workspaceSId: workspace.sId,
          directoryId: directory.id,
          total: directoryUsers.length,
          updated,
          skipped: skipped.length,
          skippedReasons: {
            noEmail: skipped.filter((r) => r.reason === "no_email").length,
            userNotFound: skipped.filter((r) => r.reason === "user_not_found")
              .length,
            noAttributes: skipped.filter((r) => r.reason === "no_attributes")
              .length,
          },
        },
        execute
          ? "Synced custom attributes for directory users"
          : "Would sync custom attributes for directory users (dry run)"
      );
    }

    if (workspaceId && totalWorkspacesProcessed === 0) {
      logger.error(
        { workspaceId },
        "Workspace not found or does not have a SCIM directory"
      );
      return;
    }

    logger.info(
      {
        totalDirectories: allDirectories.length,
        totalWorkspacesProcessed,
        totalUsersProcessed,
        totalUsersUpdated,
        execute,
      },
      execute
        ? "Completed syncing custom attributes"
        : "Completed dry run (use --execute to apply changes)"
    );
  }
);
