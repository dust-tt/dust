import { UniqueConstraintError } from "sequelize";

import { createPlugin } from "@app/lib/api/poke/types";
import { WorkspaceHasDomainModel } from "@app/lib/models/workspace_has_domain";
import { isDomain } from "@app/lib/utils";
import { Err, Ok } from "@app/types";

export const addAuthorizedDomain = createPlugin({
  manifest: {
    id: "add-authorized-domain",
    name: "Add Authorized Domain",
    description: "Add an authorized domain to the workspace",
    resourceTypes: ["workspaces"],
    args: {
      domain: {
        type: "string",
        label: "Domain",
        description: "Domain to authorize (e.g. example.com)",
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

    if (!isDomain(domain)) {
      return new Err(new Error("Invalid domain format."));
    }

    try {
      await WorkspaceHasDomainModel.create({
        domain,
        domainAutoJoinEnabled: args.autoJoinEnabled,
        workspaceId: workspace.id,
      });

      return new Ok({
        display: "text",
        value: `Domain ${domain} has been added to the workspace${args.autoJoinEnabled ? " with auto-join enabled" : ""}.`,
      });
    } catch (err) {
      if (err instanceof UniqueConstraintError) {
        return new Err(
          new Error("This domain is already authorized for another workspace.")
        );
      }
      return new Err(new Error("Failed to add domain to workspace."));
    }
  },
});
