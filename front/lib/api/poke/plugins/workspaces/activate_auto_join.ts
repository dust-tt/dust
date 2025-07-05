import { createPlugin } from "@app/lib/api/poke/types";
import { WorkspaceHasDomainModel } from "@app/lib/resources/storage/models/workspace_has_domain";
import type { EnumValue } from "@app/types";
import { Err, Ok } from "@app/types";

export const toggleAutoJoin = createPlugin({
  manifest: {
    id: "toggle-auto-join",
    name: "Toggle Auto Join for Domain",
    description:
      "Enable or disable auto join for a specific domain in the workspace.",
    resourceTypes: ["workspaces"],
    args: {
      domain: {
        type: "enum",
        label: "Domain",
        description: "Select a domain to enable or disable auto join.",
        async: true,
        values: [], // Populated dynamically
      },
      enable: {
        type: "boolean",
        label: "Enable Auto Join",
        description: "Check to enable auto join, uncheck to disable.",
      },
    },
  },
  async populateAsyncArgs(auth) {
    const owner = auth.getNonNullableWorkspace();
    const domains = await WorkspaceHasDomainModel.findAll({
      where: {
        workspaceId: owner.id,
      },
      attributes: ["domain"],
    });
    const values: EnumValue[] = domains.map((d) => ({
      label: d.domain,
      value: d.domain,
    }));
    return new Ok({ domain: values });
  },
  execute: async (auth, _, args) => {
    const owner = auth.getNonNullableWorkspace();
    const domain = args.domain;
    const enable = args.enable;
    if (!domain) {
      return new Err(new Error("Domain is required."));
    }
    const [affectedCount] = await WorkspaceHasDomainModel.update(
      { domainAutoJoinEnabled: enable },
      {
        where: {
          workspaceId: owner.id,
          domain,
        },
      }
    );
    if (affectedCount === 0) {
      return new Err(
        new Error(
          `Domain '${domain}' is not verified for this workspace or already ${enable ? "enabled" : "disabled"}.`
        )
      );
    }
    return new Ok({
      display: "text",
      value: `Auto join has been ${enable ? "enabled" : "disabled"} for domain '${domain}'.`,
    });
  },
});
