import { getWorkOS } from "@app/lib/api/workos/client";
import { syncWorkOSITContacts } from "@app/lib/api/workos/it_contacts";
import {
  findWorkspaceByWorkOSOrganizationId,
  getActiveAdminEmails,
} from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";

// Backfills WorkOS "IT contacts" for every organization that has SSO and/or SCIM
// configured. The organization list is taken straight from WorkOS (SSO
// connections + directory-sync directories) rather than iterating over every
// Dust workspace. Organizations owned by another region resolve to no local
// workspace and are skipped.
makeScript(
  {
    concurrency: {
      type: "number",
      default: 5,
      description: "How many workspaces to sync in parallel",
    },
  },
  async ({ concurrency, execute }, logger) => {
    const workos = getWorkOS();

    // Pull every SSO connection and SCIM directory across the account and keep
    // the set of organizations they belong to.
    const [connections, directories] = await Promise.all([
      workos.sso.listConnections().then((page) => page.autoPagination()),
      workos.directorySync
        .listDirectories()
        .then((page) => page.autoPagination()),
    ]);

    const organizationIds = new Set<string>();
    for (const connection of connections) {
      if (connection.organizationId) {
        organizationIds.add(connection.organizationId);
      }
    }
    for (const directory of directories) {
      if (directory.organizationId) {
        organizationIds.add(directory.organizationId);
      }
    }

    logger.info(
      {
        ssoConnections: connections.length,
        scimDirectories: directories.length,
        organizations: organizationIds.size,
      },
      "Fetched SSO/SCIM organizations from WorkOS"
    );

    const stats = {
      synced: 0,
      skippedNoWorkspace: 0,
      failed: 0,
    };

    await concurrentExecutor(
      [...organizationIds],
      async (organizationId) => {
        const workspace =
          await findWorkspaceByWorkOSOrganizationId(organizationId);
        if (!workspace) {
          // Expected in a multi-region setup: the organization belongs to
          // another region's workspace.
          stats.skippedNoWorkspace++;
          logger.info(
            { organizationId },
            "No workspace for WorkOS organization, skipping"
          );
          return;
        }

        const auth = await Authenticator.internalAdminForWorkspace(
          workspace.sId
        );
        const emails = await getActiveAdminEmails(auth);

        if (!execute) {
          logger.info(
            {
              workspaceId: workspace.sId,
              organizationId,
              admins: emails.length,
            },
            "[dry-run] Would sync workspace admins as WorkOS IT contacts"
          );
          return;
        }

        const result = await syncWorkOSITContacts({
          workspace: auth.getNonNullableWorkspace(),
          emails,
        });
        if (result.isErr()) {
          stats.failed++;
          logger.error(
            { workspaceId: workspace.sId, organizationId, error: result.error },
            "Failed to sync workspace admins as WorkOS IT contacts"
          );
          return;
        }

        stats.synced++;
        const { created, deleted, unchanged, skippedForCap } = result.value;
        logger.info(
          {
            workspaceId: workspace.sId,
            organizationId,
            created: created.length,
            deleted: deleted.length,
            unchanged,
            skippedForCap: skippedForCap.length,
          },
          "Synced workspace admins as WorkOS IT contacts"
        );
      },
      { concurrency }
    );

    logger.info({ ...stats, execute }, "Done");
  }
);
