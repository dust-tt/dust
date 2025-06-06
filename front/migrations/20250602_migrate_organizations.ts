import { getOrCreateWorkOSOrganization } from "@app/lib/api/workos/organization";
import { Authenticator } from "@app/lib/auth";
import { WorkspaceHasDomainModel } from "@app/lib/models/workspace_has_domain";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { WorkspaceType } from "@app/types";

async function shouldCreateWorkOSOrganization(
  workspace: WorkspaceType
): Promise<
  | { shouldCreate: false; domain: undefined }
  | { shouldCreate: true; domain: WorkspaceHasDomainModel }
> {
  if (workspace.workOSOrganizationId) {
    return { shouldCreate: false, domain: undefined };
  }

  const domain = await WorkspaceHasDomainModel.findOne({
    where: {
      workspaceId: workspace.id,
    },
  });

  if (!domain) {
    return { shouldCreate: false, domain: undefined };
  }

  return {
    shouldCreate: true,
    domain,
  };
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
          const org = await getOrCreateWorkOSOrganization(workspace, {
            domain: domain.domain,
          });

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
