import { getOrCreateWorkOSOrganization } from "@app/lib/api/workos/organization";
import { Authenticator } from "@app/lib/auth";
import { WorkspaceHasDomainModel } from "@app/lib/models/workspace_has_domain";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { WorkspaceType } from "@app/types";

// We create a WorkOS organization only if:
// - the workspace has a domain associated
// - the workspace has an active subscription.
async function shouldCreateWorkOSOrganization(
  workspace: WorkspaceType
): Promise<
  | { shouldCreate: false; domain: undefined }
  | { shouldCreate: true; domain: string | undefined }
> {
  if (workspace.workOSOrganizationId) {
    return { shouldCreate: false, domain: undefined };
  }

  const d = await WorkspaceHasDomainModel.findOne({
    where: {
      workspaceId: workspace.id,
    },
  });
  if (d) {
    return { shouldCreate: true, domain: d.domain };
  }

  const activeSubscription =
    await SubscriptionResource.fetchActiveByWorkspace(workspace);
  if (activeSubscription) {
    return { shouldCreate: true, domain: undefined };
  }

  return { shouldCreate: false, domain: undefined };
}

makeScript({}, async ({ execute }, logger) => {
  await runOnAllWorkspaces(
    async (lightWorkspace) => {
      const auth = await Authenticator.internalAdminForWorkspace(
        lightWorkspace.sId
      );
      const workspace = auth.workspace();
      if (!workspace) {
        return;
      }

      const subscription = auth.subscription();
      if (!subscription) {
        return;
      }

      const { shouldCreate, domain } =
        await shouldCreateWorkOSOrganization(workspace);
      if (shouldCreate) {
        logger.info(
          { workspaceId: workspace.sId },
          "Creating WorkOS organization"
        );

        if (execute) {
          const org = await getOrCreateWorkOSOrganization(
            workspace,
            domain
              ? {
                  domain,
                }
              : undefined
          );

          if (org.isOk()) {
            logger.info(
              { workspaceId: workspace.sId, organizationId: org.value.id },
              "Created WorkOS organization"
            );
          } else {
            logger.info(
              { workspaceId: workspace.sId, error: org.error.message },
              "Failed to create WorkOS organization"
            );
          }
        }
      }
    },
    { concurrency: 10 }
  );

  logger.info("Organizations migration completed");
});
