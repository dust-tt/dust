import {
  getWorkspacePlanLimitOverrides,
  setWorkspacePlanLimitOverrides,
} from "@app/lib/api/plan_limit_overrides";
import { createPlugin } from "@app/lib/api/poke/types";
import type { PlanLimitOverride } from "@app/lib/plans/plan_limit_overrides";
import { Err, Ok } from "@app/types/shared/result";
import { z } from "zod";

const UNLIMITED = -1;

const SeatLimitOverridesSchema = z.object({
  overrideMaxUsers: z.boolean(),
  maxUsers: z.number().int().min(UNLIMITED).optional(),
  overrideMaxFreeUsers: z.boolean(),
  maxFreeUsers: z.number().int().min(UNLIMITED).optional(),
  overrideMaxLifetimeFreeUsers: z.boolean(),
  maxLifetimeFreeUsers: z.number().int().min(UNLIMITED).optional(),
});

function resolveOverride(
  enabled: boolean,
  value: number | undefined
): number | null {
  return enabled && value !== undefined ? value : null;
}

function describeLimit(value: number | null): string {
  if (value === null) {
    return "plan value";
  }
  return value === UNLIMITED ? "unlimited" : `${value}`;
}

export const overridePlanSeatLimitsPlugin = createPlugin({
  manifest: {
    id: "override-plan-seat-limits",
    name: "Override Plan Seat Limits",
    description:
      "Override this workspace's seat limits without creating a dedicated plan. " +
      "Each limit falls back to the plan value when its toggle is off. Use -1 for unlimited.",
    explanation:
      "Overrides are workspace-scoped: they survive plan changes and renewals, and they " +
      "also win over the trial limits. They cap seat assignment and what the product " +
      "displays — they do not change what is billed (see 'Manage Seat Limits' for billing " +
      "floors). Raising the lifetime free-seat cap only affects users onboarded from now " +
      "on; lowering a cap never revokes existing seats.",
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
    },
    requiredRoles: ["billing"],
  },

  populateAsyncArgs: async (auth) => {
    // These limits are already the effective ones: the override is applied when
    // the plan is resolved for the workspace. So prefilling the number fields
    // with them is correct whether or not an override is in place.
    const planLimits = auth.getNonNullablePlan().limits.users;
    const override = await getWorkspacePlanLimitOverrides(auth);

    return new Ok({
      overrideMaxUsers: override?.maxUsersInWorkspace != null,
      overrideMaxUsersDescription:
        "Override the plan's max-users cap for this workspace only.",
      maxUsers: planLimits.maxUsers,
      overrideMaxFreeUsers: override?.maxFreeUsersInWorkspace != null,
      overrideMaxFreeUsersDescription:
        "Override the plan's active free-seat cap for this workspace only.",
      maxFreeUsers: planLimits.maxFreeUsers,
      overrideMaxLifetimeFreeUsers:
        override?.maxLifetimeFreeUsersInWorkspace != null,
      overrideMaxLifetimeFreeUsersDescription:
        "Override the plan's lifetime free-seat cap for this workspace only.",
      maxLifetimeFreeUsers: planLimits.maxLifetimeFreeUsers,
    });
  },

  execute: async (auth, _, args) => {
    const parseResult = SeatLimitOverridesSchema.safeParse(args);
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
      ].join(" "),
    });
  },
});
