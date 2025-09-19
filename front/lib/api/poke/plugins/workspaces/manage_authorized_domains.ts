import type { PluginResponse } from "@app/lib/api/poke/types";
import { createPlugin } from "@app/lib/api/poke/types";
import { checkUserRegionAffinity } from "@app/lib/api/regions/lookup";
import {
  addWorkOSOrganizationDomain,
  getWorkOSOrganization,
  removeWorkOSOrganizationDomain,
} from "@app/lib/api/workos/organization";
import { getOrCreateWorkOSOrganization } from "@app/lib/api/workos/organization";
import type { Authenticator } from "@app/lib/auth";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { WorkspaceHasDomainModel } from "@app/lib/resources/storage/models/workspace_has_domain";
import { isDomain } from "@app/lib/utils";
import type { Result } from "@app/types";
import { Err, mapToEnumValues, Ok } from "@app/types";

async function handleAddDomain(
  auth: Authenticator,
  { domain }: { domain: string },
  existingDomain: WorkspaceHasDomainModel | null
): Promise<Result<PluginResponse, Error>> {
  const workspace = auth.getNonNullableWorkspace();

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

  // Check if domain is whitelisted in any other region.
  const affinityRes = await checkUserRegionAffinity({
    email: `email@${domain}`,
    email_verified: true,
  });
  if (affinityRes.isErr()) {
    return new Err(new Error("Cannot check domain in other region."));
  } else if (affinityRes.value.hasAffinity) {
    return new Err(
      new Error(
        `This domain is already authorized in region ${affinityRes.value.region}.`
      )
    );
  }

  const workOSOrganizationRes = await getOrCreateWorkOSOrganization(workspace);
  if (workOSOrganizationRes.isErr()) {
    return new Err(workOSOrganizationRes.error);
  }

  // If organization has just been created, the domain has been added to the organization.
  if (!workOSOrganizationRes.value.domains.some((d) => d.domain === domain)) {
    const result = await addWorkOSOrganizationDomain(workspace, {
      domain,
    });
    if (result.isErr()) {
      return new Err(result.error);
    }
  }

  return new Ok({
    display: "text",
    value:
      `Domain ${domain} has been added to the workspace. Next webhook will add it to ` +
      "the workspace in the database.",
  });
}

export async function handleRemoveDomain(
  auth: Authenticator,
  { domain }: { domain: string },
  existingDomain: WorkspaceHasDomainModel | null
): Promise<Result<PluginResponse, Error>> {
  const workspace = auth.getNonNullableWorkspace();

  if (!existingDomain || existingDomain.workspaceId !== workspace.id) {
    return new Err(
      new Error(`Domain ${domain} is not authorized for this workspace.`)
    );
  }

  const organization = await getWorkOSOrganization(workspace);
  if (!organization) {
    return new Err(new Error("Failed to get WorkOS organization."));
  }

  const result = await removeWorkOSOrganizationDomain(workspace, {
    domain,
  });
  if (result.isErr()) {
    return new Err(result.error);
  }

  return new Ok({
    display: "text",
    value:
      `Domain ${domain} has been removed from the workspace in WorkOS. Next webhook will ` +
      "remove it from the workspace in the database.",
  });
}

export const addAuthorizedDomain = createPlugin({
  manifest: {
    id: "manage-authorized-domains",
    name: "Add/Remove Authorized Domain",
    description: "Add or remove an authorized domain to the workspace",
    resourceTypes: ["workspaces"],
    args: {
      domain: {
        type: "string",
        label: "Domain",
        description: "Domain to authorize/remove (e.g. example.com)",
      },
      operation: {
        type: "enum",
        label: "Operation",
        description: "Select operation to perform",
        values: mapToEnumValues(["add", "remove"], (operation) => ({
          label: operation,
          value: operation,
        })),
        multiple: false,
      },
    },
  },
  execute: async (auth, _, args) => {
    const domain = args.domain.trim().toLowerCase();
    const operation = args.operation;
    if (!isDomain(domain)) {
      return new Err(new Error("Invalid domain format."));
    }
    if (!operation) {
      return new Err(new Error("Please select an operation."));
    }

    // Check if domain exists in any workspace.
    const existingDomain = await WorkspaceHasDomainModel.findOne({
      where: { domain },
      include: [
        {
          model: WorkspaceModel,
          as: "workspace",
          required: true,
        },
      ],
    });

    if (operation[0] === "add") {
      return handleAddDomain(auth, { domain }, existingDomain);
    } else {
      return handleRemoveDomain(auth, { domain }, existingDomain);
    }
  },
});
