import type { Authenticator } from "@app/lib/auth";
import { WorkspaceVerificationAttemptResource } from "@app/lib/resources/workspace_verification_attempt_resource";
import { faker } from "@faker-js/faker";

export class WorkspaceVerificationAttemptFactory {
  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  static async create(
    auth: Authenticator,
    {
      phoneNumberHash = WorkspaceVerificationAttemptResource.hashPhoneNumber(
        faker.phone.number()
      ),
      twilioVerificationSid = `VA${faker.string.alphanumeric(32)}`,
    }: {
      phoneNumberHash?: string;
      twilioVerificationSid?: string;
    } = {}
  ) {
    return WorkspaceVerificationAttemptResource.makeNew(auth, {
      phoneNumberHash,
      twilioVerificationSid,
    });
  }
}
