import { createPlugin } from "@app/lib/api/poke/types";
import { Workspace } from "@app/lib/models/workspace";
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
  },
});
