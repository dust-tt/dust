import {
  resetFairUseAwuCreditsRateLimitForUser,
  resetMessageRateLimitForWorkspace,
} from "@app/lib/api/assistant/rate_limits";
import { createPlugin } from "@app/lib/api/poke/types";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { mapToEnumValues } from "@app/types/poke/plugins";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { z } from "zod";

const RESET_TARGETS = ["workspace_rate_limit", "user_awu_fair_use"] as const;

const ResetMessageRateLimitArgsSchema = z
  .object({
    resetTarget: z.array(z.enum(RESET_TARGETS)).length(1),
    userEmail: z.string().trim().optional(),
  })
  .refine(
    (args) =>
      args.resetTarget[0] !== "user_awu_fair_use" ||
      (args.userEmail !== undefined && args.userEmail.length > 0),
    {
      message: "User email is required to reset fair-use AWU credits.",
      path: ["userEmail"],
    }
  );

export const resetMessageRateLimitPlugin = createPlugin({
  manifest: {
    id: "reset-message-rate-limit",
    name: "Reset Message Rate Limits",
    description:
      "Reset the workspace message rate limit or a user's AWU fair-use limit.",
    resourceTypes: ["workspaces"],
    args: {
      resetTarget: {
        type: "enum",
        label: "Reset Target",
        description: "Choose which limit to reset.",
        values: mapToEnumValues(RESET_TARGETS, (value) => ({
          label: value,
          value,
          checked: value === "workspace_rate_limit",
        })),
        multiple: false,
      },
      userEmail: {
        type: "string",
        label: "User Email",
        description:
          "Email of the workspace user whose AWU fair-use counter should be reset.",
        dependsOn: { field: "resetTarget", value: "user_awu_fair_use" },
      },
    },
    requiredRoles: ["support"],
  },
  execute: async (auth, resource, args) => {
    const subscription = auth.subscription();
    const plan = auth.plan();

    if (!subscription || !plan) {
      return new Err(new Error("The workspace does not have a subscription."));
    }

    const parseResult = ResetMessageRateLimitArgsSchema.safeParse(args);
    if (!parseResult.success) {
      return new Err(
        new Error(
          `Invalid arguments: ${parseResult.error.errors
            .map((e) => `${e.path.join(".")}: ${e.message}`)
            .join(", ")}`
        )
      );
    }

    const resetTarget = parseResult.data.resetTarget[0];
    if (!resetTarget) {
      return new Err(new Error("Please select a reset target."));
    }

    switch (resetTarget) {
      case "workspace_rate_limit": {
        await resetMessageRateLimitForWorkspace(auth);

        return new Ok({
          display: "text",
          value: `Workspace message rate limit reset for workspace ${resource?.sId}.`,
        });
      }

      case "user_awu_fair_use": {
        const { userEmail } = parseResult.data;
        if (!userEmail) {
          return new Err(new Error("User email is required."));
        }

        const user = await UserResource.fetchByEmail(userEmail);
        if (!user) {
          return new Err(
            new Error(`Could not find user with email ${userEmail}.`)
          );
        }

        const workspace = auth.getNonNullableWorkspace();
        const membership =
          await MembershipResource.getActiveMembershipOfUserInWorkspace({
            user,
            workspace,
          });
        if (!membership) {
          return new Err(
            new Error(
              `User ${user.email} is not an active member of workspace ${workspace.sId}.`
            )
          );
        }

        const resetResult = await resetFairUseAwuCreditsRateLimitForUser({
          auth,
          user: user.toJSON(),
        });
        if (resetResult.isErr()) {
          return resetResult;
        }

        const keyStatus = resetResult.value.didResetExistingKey
          ? "existing counter cleared"
          : "no existing counter found";
        return new Ok({
          display: "text",
          value: `AWU fair-use limit reset for ${user.email} (${keyStatus}; limit ${resetResult.value.limit} credits per ${resetResult.value.timeframe}).`,
        });
      }

      default:
        return assertNever(resetTarget);
    }
  },
});
