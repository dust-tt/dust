import { createPlugin } from "@app/lib/api/poke/types";
import { WorkspaceVerificationAttemptResource } from "@app/lib/resources/workspace_verification_attempt_resource";
import { Err, Ok } from "@app/types/shared/result";

export const insertVerifiedWorkspaceVerificationAttemptPlugin = createPlugin({
  manifest: {
    id: "insert-verified-workspace-verification-attempt",
    name: "Insert Verified Workspace Phone",
    description:
      "Insert a successful workspace phone verification attempt (bypasses the normal OTP + risk checks).",
    warning:
      "This bypasses the normal phone verification flow. Use only for support-approved exceptions.",
    resourceTypes: ["workspaces"],
    args: {
      phoneNumber: {
        type: "string",
        label: "Phone number (E.164)",
        description: "Example: +4511122233",
        redact: true,
      },
    },
  },
  execute: async (auth, workspace, args) => {
    if (!workspace) {
      return new Err(new Error("Cannot find workspace."));
    }

    const { phoneNumber } = args;

    if (!/^\+[1-9]\d{1,14}$/.test(phoneNumber)) {
      return new Err(
        new Error("Invalid phone number format (expected E.164).")
      );
    }

    const phoneNumberHash =
      WorkspaceVerificationAttemptResource.hashPhoneNumber(phoneNumber);

    const existingAttempt =
      await WorkspaceVerificationAttemptResource.fetchByPhoneHash(
        auth,
        phoneNumberHash
      );

    if (existingAttempt?.verifiedAt) {
      return new Ok({
        display: "text",
        value: `Workspace "${workspace.name}" already has a verified phone attempt for the provided number.`,
      });
    }

    const isUsedElsewhere =
      await WorkspaceVerificationAttemptResource.isPhoneAlreadyUsed(
        phoneNumberHash
      );
    if (isUsedElsewhere) {
      return new Err(
        new Error(
          "This phone number is already verified for another workspace and cannot be reused."
        )
      );
    }

    if (existingAttempt) {
      await existingAttempt.markVerified();
    } else {
      await WorkspaceVerificationAttemptResource.makeVerified(auth, {
        phoneNumberHash,
      });
    }

    return new Ok({
      display: "text",
      value: `Inserted a verified workspace phone attempt for workspace "${workspace.name}".`,
    });
  },
});
