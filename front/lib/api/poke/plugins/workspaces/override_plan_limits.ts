import {
  getWorkspacePlanLimitOverrides,
  setWorkspacePlanLimitOverrides,
} from "@app/lib/api/plan_limit_overrides";
import { createPlugin } from "@app/lib/api/poke/types";
import type { PlanLimitOverride } from "@app/lib/plans/plan_limit_overrides";
import { Err, Ok } from "@app/types/shared/result";
import { z } from "zod";

const UNLIMITED = -1;

const PlanLimitOverridesSchema = z.object({
  overrideMaxUsers: z.boolean(),
  maxUsers: z.number().int().min(UNLIMITED).optional(),
  overrideMaxFreeUsers: z.boolean(),
  maxFreeUsers: z.number().int().min(UNLIMITED).optional(),
  overrideMaxLifetimeFreeUsers: z.boolean(),
  maxLifetimeFreeUsers: z.number().int().min(UNLIMITED).optional(),
  overrideMaxVaults: z.boolean(),
  maxVaults: z.number().int().min(UNLIMITED).optional(),
  overrideMaxDataSources: z.boolean(),
  maxDataSources: z.number().int().min(UNLIMITED).optional(),
  overrideMaxConnections: z.boolean(),
  maxConnections: z.number().int().min(UNLIMITED).optional(),
  overrideSSO: z.boolean(),
  isSSOAllowed: z.boolean().optional(),
  overrideSCIM: z.boolean(),
  isSCIMAllowed: z.boolean().optional(),
});

function resolveOverride<T extends number | boolean>(
  enabled: boolean,
  value: T | undefined
): T | null {
  return enabled && value !== undefined ? value : null;
}

function describeLimit(value: number | null): string {
  if (value === null) {
    return "plan value";
  }
  return value === UNLIMITED ? "unlimited" : `${value}`;
}

function describeFlag(value: boolean | null): string {
  if (value === null) {
    return "plan value";
  }
  return value ? "allowed" : "denied";
}

export const overridePlanLimitsPlugin = createPlugin({
  manifest: {
    id: "override-plan-limits",
    name: "Override Plan Limits",
    description:
      "Override this workspace's seat, space and data-source limits, and its SSO/SCIM " +
      "entitlements, without creating a dedicated plan. Each setting falls back to the " +
      "plan value when its toggle is off. Use -1 for unlimited.",
    explanation:
      "Overrides are workspace-scoped: they survive plan changes and renewals, and they " +
      "also win over the trial limits. They cap what can be created or assigned and what " +
      "the product displays — they do not change what is billed (see 'Manage Seat Limits' " +
      "for billing floors). Raising the lifetime free-seat cap only affects users onboarded " +
      "from now on; lowering a cap never removes what already exists.",
    resourceTypes: ["workspaces"],
    args: {
      overrideMaxUsers: {
        type: "boolean",
        variant: "toggle",
        label: "Override max users",
        async: true,
        asyncDescription: true,
      },
      maxUsers: {
        type: "number",
        variant: "text",
        label: "Max users",
        description:
          "Maximum active members + pending invitations in the workspace. -1 for unlimited.",
        async: true,
        dependsOn: { field: "overrideMaxUsers", value: true },
      },
      overrideMaxFreeUsers: {
        type: "boolean",
        variant: "toggle",
        label: "Override max free seats",
        async: true,
        asyncDescription: true,
      },
      maxFreeUsers: {
        type: "number",
        variant: "text",
        label: "Max free seats",
        description:
          "Maximum simultaneously-active `free` seats. -1 for unlimited.",
        async: true,
        dependsOn: { field: "overrideMaxFreeUsers", value: true },
      },
      overrideMaxLifetimeFreeUsers: {
        type: "boolean",
        variant: "toggle",
        label: "Override max lifetime free seats",
        async: true,
        asyncDescription: true,
      },
      maxLifetimeFreeUsers: {
        type: "number",
        variant: "text",
        label: "Max lifetime free seats",
        description:
          "Maximum distinct users ever assigned a `free` seat (active + revoked). -1 for unlimited.",
        async: true,
        dependsOn: { field: "overrideMaxLifetimeFreeUsers", value: true },
      },
      overrideMaxVaults: {
        type: "boolean",
        variant: "toggle",
        label: "Override max spaces",
        async: true,
        asyncDescription: true,
      },
      maxVaults: {
        type: "number",
        variant: "text",
        label: "Max spaces",
        description:
          "Maximum regular spaces in the workspace. -1 for unlimited.",
        async: true,
        dependsOn: { field: "overrideMaxVaults", value: true },
      },
      overrideMaxDataSources: {
        type: "boolean",
        variant: "toggle",
        label: "Override max data sources",
        async: true,
        asyncDescription: true,
      },
      maxDataSources: {
        type: "number",
        variant: "text",
        label: "Max data sources",
        description:
          "Maximum data sources of any kind — folders, websites and connectors. " +
          "-1 for unlimited.",
        async: true,
        dependsOn: { field: "overrideMaxDataSources", value: true },
      },
      overrideMaxConnections: {
        type: "boolean",
        variant: "toggle",
        label: "Override max connections",
        async: true,
        asyncDescription: true,
      },
      maxConnections: {
        type: "number",
        variant: "text",
        label: "Max connections",
        description:
          "Maximum user-added managed connectors (Slack, Notion, GDrive…). Excludes " +
          "folders, websites, bot integrations and the project connector. -1 for unlimited.",
        async: true,
        dependsOn: { field: "overrideMaxConnections", value: true },
      },
      overrideSSO: {
        type: "boolean",
        variant: "toggle",
        label: "Override SSO entitlement",
        async: true,
        asyncDescription: true,
      },
      isSSOAllowed: {
        type: "boolean",
        variant: "toggle",
        label: "SSO allowed",
        description:
          "Whether this workspace can configure SSO, regardless of its plan.",
        async: true,
        dependsOn: { field: "overrideSSO", value: true },
      },
      overrideSCIM: {
        type: "boolean",
        variant: "toggle",
        label: "Override SCIM entitlement",
        async: true,
        asyncDescription: true,
      },
      isSCIMAllowed: {
        type: "boolean",
        variant: "toggle",
        label: "SCIM allowed",
        description:
          "Whether this workspace can configure SCIM user provisioning, regardless of " +
          "its plan.",
        async: true,
        dependsOn: { field: "overrideSCIM", value: true },
      },
    },
    requiredRoles: ["billing"],
  },

  populateAsyncArgs: async (auth) => {
    // These limits are already the effective ones: the override is applied when
    // the plan is resolved for the workspace. So prefilling the number fields
    // with them is correct whether or not an override is in place.
    const { limits } = auth.getNonNullablePlan();
    const override = await getWorkspacePlanLimitOverrides(auth);

    return new Ok({
      overrideMaxUsers: override?.maxUsersInWorkspace != null,
      overrideMaxUsersDescription:
        "Override the plan's max-users cap for this workspace only.",
      maxUsers: limits.users.maxUsers,
      overrideMaxFreeUsers: override?.maxFreeUsersInWorkspace != null,
      overrideMaxFreeUsersDescription:
        "Override the plan's active free-seat cap for this workspace only.",
      maxFreeUsers: limits.users.maxFreeUsers,
      overrideMaxLifetimeFreeUsers:
        override?.maxLifetimeFreeUsersInWorkspace != null,
      overrideMaxLifetimeFreeUsersDescription:
        "Override the plan's lifetime free-seat cap for this workspace only.",
      maxLifetimeFreeUsers: limits.users.maxLifetimeFreeUsers,
      overrideMaxVaults: override?.maxVaultsInWorkspace != null,
      overrideMaxVaultsDescription:
        "Override the plan's space cap for this workspace only.",
      maxVaults: limits.vaults.maxVaults,
      overrideMaxDataSources: override?.maxDataSourcesCount != null,
      overrideMaxDataSourcesDescription:
        "Override the plan's data-source cap for this workspace only.",
      maxDataSources: limits.dataSources.count,
      overrideMaxConnections: override?.maxConnectionsCount != null,
      overrideMaxConnectionsDescription:
        "Override the plan's connection cap for this workspace only.",
      maxConnections: limits.connections.count,
      overrideSSO: override?.isSSOAllowed != null,
      overrideSSODescription:
        "Override the plan's SSO entitlement for this workspace only.",
      isSSOAllowed: limits.users.isSSOAllowed,
      overrideSCIM: override?.isSCIMAllowed != null,
      overrideSCIMDescription:
        "Override the plan's SCIM entitlement for this workspace only.",
      isSCIMAllowed: limits.users.isSCIMAllowed,
    });
  },

  execute: async (auth, _, args) => {
    const parseResult = PlanLimitOverridesSchema.safeParse(args);
    if (!parseResult.success) {
      return new Err(
        new Error(
          `Invalid arguments: ${parseResult.error.errors
            .map((e) => `${e.path.join(".")}: ${e.message}`)
            .join(", ")}`
        )
      );
    }

    const {
      overrideMaxUsers,
      maxUsers,
      overrideMaxFreeUsers,
      maxFreeUsers,
      overrideMaxLifetimeFreeUsers,
      maxLifetimeFreeUsers,
      overrideMaxVaults,
      maxVaults,
      overrideMaxDataSources,
      maxDataSources,
      overrideMaxConnections,
      maxConnections,
      overrideSSO,
      isSSOAllowed,
      overrideSCIM,
      isSCIMAllowed,
    } = parseResult.data;

    const override: PlanLimitOverride = {
      maxUsersInWorkspace: resolveOverride(overrideMaxUsers, maxUsers),
      maxFreeUsersInWorkspace: resolveOverride(
        overrideMaxFreeUsers,
        maxFreeUsers
      ),
      maxLifetimeFreeUsersInWorkspace: resolveOverride(
        overrideMaxLifetimeFreeUsers,
        maxLifetimeFreeUsers
      ),
      maxVaultsInWorkspace: resolveOverride(overrideMaxVaults, maxVaults),
      maxDataSourcesCount: resolveOverride(
        overrideMaxDataSources,
        maxDataSources
      ),
      maxConnectionsCount: resolveOverride(
        overrideMaxConnections,
        maxConnections
      ),
      isSSOAllowed: resolveOverride(overrideSSO, isSSOAllowed),
      isSCIMAllowed: resolveOverride(overrideSCIM, isSCIMAllowed),
    };

    const res = await setWorkspacePlanLimitOverrides(auth, override);
    if (res.isErr()) {
      return res;
    }

    return new Ok({
      display: "text",
      value: [
        `Max users: ${describeLimit(override.maxUsersInWorkspace)}.`,
        `Max free seats: ${describeLimit(override.maxFreeUsersInWorkspace)}.`,
        `Max lifetime free seats: ${describeLimit(override.maxLifetimeFreeUsersInWorkspace)}.`,
        `Max spaces: ${describeLimit(override.maxVaultsInWorkspace)}.`,
        `Max data sources: ${describeLimit(override.maxDataSourcesCount)}.`,
        `Max connections: ${describeLimit(override.maxConnectionsCount)}.`,
        `SSO: ${describeFlag(override.isSSOAllowed)}.`,
        `SCIM: ${describeFlag(override.isSCIMAllowed)}.`,
      ].join(" "),
    });
  },
});
