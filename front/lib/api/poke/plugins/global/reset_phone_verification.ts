import { createPlugin } from "@app/lib/api/poke/types";
import {
  PHONE_REGEXP,
  WorkspaceVerificationAttemptResource,
} from "@app/lib/resources/workspace_verification_attempt_resource";
import { Err, Ok } from "@app/types/shared/result";

export const resetPhoneVerificationPlugin = createPlugin({
  manifest: {
    id: "reset-phone-verification",
    name: "Reset Phone Verification",
    description:
      "Delete the verified workspace verification attempt for the given phone number (across workspaces) and clear the per-phone rate-limit key, allowing the number to be used again.",
    warning:
      "This bypasses the global uniqueness check on phone numbers. Use only for support-approved exceptions.",
    resourceTypes: ["global"],
    args: {
      phoneNumber: {
        type: "string",
        label: "Phone number (E.164)",
        description: "Example: +4511122233",
        redact: true,
      },
      confirmReset: {
        type: "boolean",
        label: "Confirm reset",
        description:
          "Confirm you want to delete every verification attempt for this phone number.",
      },
    },
    requiredRoles: ["support"],
  },
  execute: async (_, __, args) => {
    const { phoneNumber, confirmReset } = args;

    if (!confirmReset) {
      return new Err(new Error("Reset not confirmed."));
    }

    if (!PHONE_REGEXP.test(phoneNumber)) {
      return new Err(
        new Error("Invalid phone number format (expected E.164).")
      );
    }

    const phoneNumberHash =
      WorkspaceVerificationAttemptResource.hashPhoneNumber(phoneNumber);

    const deletedCount =
      await WorkspaceVerificationAttemptResource.deleteByPhoneHash(
        phoneNumberHash
      );

    return new Ok({
      display: "text",
      value: `Deleted ${deletedCount} verification attempt(s) for the provided phone number.`,
    });
  },
});
