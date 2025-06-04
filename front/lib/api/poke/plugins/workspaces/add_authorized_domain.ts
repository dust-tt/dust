import { P } from "pino";

import { createPlugin } from "@app/lib/api/poke/types";
import { checkUserRegionAffinity } from "@app/lib/api/regions/lookup";
import { Workspace } from "@app/lib/models/workspace";
import { WorkspaceHasDomainModel } from "@app/lib/models/workspace_has_domain";
import { isDomain } from "@app/lib/utils";
import { Err, Ok } from "@app/types";

export const addAuthorizedDomain = createPlugin({
  manifest: {
    id: "add-authorized-domain",
    name: "Add/Remove Authorized Domain",
    description: "Add or remove an authorized domain to the workspace",
    resourceTypes: ["workspaces"],
    args: {
      domain: {
        type: "string",
        label: "Domain",
        description: "Domain to authorize (e.g. example.com)",
      },
      operation: {
        type: "enum",
        label: "Operation",
        description: "Select operation to perform",
        values: ["add", "remove"],
      },
      autoJoinEnabled: {
        type: "boolean",
        label: "Auto Join Enabled",
        description:
          "Whether to automatically add users with this domain email",
        default: false,
      },
    },
  },
  execute: async (auth, _, args) => {
    const workspace = auth.getNonNullableWorkspace();
    const domain = args.domain.trim().toLowerCase();
    const operation = args.operation;
    if (!isDomain(domain)) {
      return new Err(new Error("Invalid domain format."));
    }
    if (!operation) {
      return new Err(new Error("Please select an operation."));
    }

    // Check if domain exists in any workspace
    const existingDomain = await WorkspaceHasDomainModel.findOne({
      where: { domain },
      include: [
        {
          model: Workspace,
          as: "workspace",
          required: true,
        },
      ],
    });

    if (operation === "add") {
      if (existingDomain) {
        if (existingDomain.workspaceId === workspace.id) {
          return new Ok({
            display: "text",
            value: `Domain ${domain} is already authorized for this workspace.`,
          });
        }
        return new Err(
          new Error(
            `This domain is already authorized for workspace ${existingDomain.workspace.sId}.`
          )
        );
      }
      const affinity = await checkUserRegionAffinity({
        email: `email@${domain}`,
        email_verified: true,
      });

      if (affinity.isErr()) {
        return new Err(new Error(`Cannot check domain in other region.`));
      } else if (affinity.value.hasAffinity) {
        return new Err(
          new Error(
            `This domain is already authorized in region ${affinity.value.region}.`
          )
        );
      }

      // Create the domain since it doesn't exist
      await WorkspaceHasDomainModel.create({
        domain,
        domainAutoJoinEnabled: args.autoJoinEnabled,
        workspaceId: workspace.id,
      });

      return new Ok({
        display: "text",
        value: `Domain ${domain} has been added to the workspace${args.autoJoinEnabled ? " with auto-join enabled" : ""}.`,
      });
    } else {
      if (!existingDomain || existingDomain.workspaceId !== workspace.id) {
        return new Err(
          new Error(`Domain ${domain} is not authorized for this workspace.`)
        );
      }

      await existingDomain.destroy();

      return new Ok({
        display: "text",
        value: `Domain ${domain} has been removed from the workspace.`,
      });
    }
  },
});
