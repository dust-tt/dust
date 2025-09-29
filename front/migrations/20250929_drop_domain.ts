import { removeWorkOSOrganizationDomain } from "@app/lib/api/workos/organization";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { WorkspaceHasDomainModel } from "@app/lib/resources/storage/models/workspace_has_domain";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";

// Should only be used in the following situation:
// - Domain was verified in the current region.
// - Domain was also verified in the other region.
// - The webhook on the `organization_domain.verified` event crashes.
// This script mimics what we would do for a single region (see upsertWorkspaceDomain).

makeScript(
  {
    domain: {
      type: "string",
    },
    workspaceId: {
      type: "string",
    },
  },
  async ({ domain, execute }, logger) => {
    const existingDomainInRegion = await WorkspaceHasDomainModel.findOne({
      where: { domain },
      include: [
        {
          model: WorkspaceModel,
          as: "workspace",
          required: true,
        },
      ],
    });

    if (!existingDomainInRegion) {
      logger.error({ domain }, "Domain not found");
      return;
    }

    logger.info(
      {
        domain,
        workspaceId: existingDomainInRegion.workspace.id,
      },
      "Dropping existing domain"
    );

    const { workspace } = existingDomainInRegion;

    if (execute) {
      // Delete the domain from the DB.
      await existingDomainInRegion.destroy();

      // Delete the domain from WorkOS.
      await removeWorkOSOrganizationDomain(
        renderLightWorkspaceType({ workspace }),
        {
          domain,
        }
      );
    }
  }
);
