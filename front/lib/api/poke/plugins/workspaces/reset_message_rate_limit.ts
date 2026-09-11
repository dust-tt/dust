import {
  resetFairUseAwuCreditsRateLimitForUser,
  resetMessageRateLimitForWorkspace,
  resetPremiumModelMessageRateLimitForUser,
} from "@app/lib/api/assistant/rate_limits";
import { createPlugin } from "@app/lib/api/poke/types";
import type { Authenticator } from "@app/lib/auth";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { mapToEnumValues } from "@app/types/poke/plugins";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { z } from "zod";

const RESET_TARGETS = [
  "workspace_rate_limit",
  "user_awu_fair_use",
  "user_premium_model_limit",
] as const;

const USER_SCOPED_RESET_TARGETS = [
  "user_awu_fair_use",
  "user_premium_model_limit",
] as const;

const ResetMessageRateLimitArgsSchema = z
  .object({
    resetTarget: z.array(z.enum(RESET_TARGETS)).length(1),
    userEmail: z.string().trim().optional(),
  })
  .refine(
    (args) =>
      !USER_SCOPED_RESET_TARGETS.includes(
        args.resetTarget[0] as (typeof USER_SCOPED_RESET_TARGETS)[number]
      ) ||
      (args.userEmail !== undefined && args.userEmail.length > 0),
    {
      message: "User email is required to reset a per-user limit.",
      path: ["userEmail"],
    }
  );

async function resolveActiveWorkspaceUser(
  auth: Authenticator,
  userEmail: string | undefined
) {
  if (!userEmail) {
    return new Err(new Error("User email is required."));
  }

  const user = await UserResource.fetchByEmail(userEmail);
  if (!user) {
    return new Err(new Error(`Could not find user with email ${userEmail}.`));
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

  return new Ok(user);
}

export const resetMessageRateLimitPlugin = createPlugin({
  manifest: {
    id: "reset-message-rate-limit",
    name: "Reset Message Rate Limits",
    description:
      "Reset the workspace message rate limit, a user's AWU fair-use limit, " +
      "or a user's premium-model weekly message limit.",
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
          "Email of the workspace user whose counter should be reset. " +
          "Required for the AWU fair-use and premium-model resets.",
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
        const userResult = await resolveActiveWorkspaceUser(
          auth,
          parseResult.data.userEmail
        );
        if (userResult.isErr()) {
          return userResult;
        }
        const user = userResult.value;

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

      case "user_premium_model_limit": {
        const userResult = await resolveActiveWorkspaceUser(
          auth,
          parseResult.data.userEmail
        );
        if (userResult.isErr()) {
          return userResult;
        }
        const user = userResult.value;

        const resetResult = await resetPremiumModelMessageRateLimitForUser({
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
          value: `Premium-model message limit reset for ${user.email} (${keyStatus}; limit ${resetResult.value.limit} messages per week).`,
        });
      }

      default:
        return assertNever(resetTarget);
    }
  },
});
