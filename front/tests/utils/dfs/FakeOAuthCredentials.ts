import type { OAuthAPIError } from "@app/types/oauth/oauth_api";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

type StoredCredential = {
  provider: string;
  workspaceId: string;
  userId: string;
  content: Record<string, string>;
};

/**
 * In-memory stand-in for the oauth service's credentials endpoints, to back a mocked `OAuthAPI`
 * (`postCredentials`, `getCredentials`, `deleteCredentials`).
 */
export class FakeOAuthCredentials {
  readonly credentials = new Map<string, StoredCredential>();
  // When set, `postCredentials` fails with this error.
  postError: OAuthAPIError | null = null;
  private counter = 0;

  async postCredentials({
    provider,
    workspaceId,
    userId,
    credentials,
  }: {
    provider: string;
    workspaceId: string;
    userId: string;
    credentials: Record<string, string>;
  }): Promise<
    Result<
      { credential: { credential_id: string; created: number } },
      OAuthAPIError
    >
  > {
    if (this.postError) {
      return new Err(this.postError);
    }
    const credentialId = `cred_${++this.counter}-secret`;
    this.credentials.set(credentialId, {
      provider,
      workspaceId,
      userId,
      content: credentials,
    });
    return new Ok({ credential: { credential_id: credentialId, created: 0 } });
  }

  async getCredentials({
    credentialsId,
  }: {
    credentialsId: string;
  }): Promise<
    Result<{ credential: { content: Record<string, string> } }, OAuthAPIError>
  > {
    const stored = this.credentials.get(credentialsId);
    return stored
      ? new Ok({ credential: { content: stored.content } })
      : new Err({ code: "credential_not_found", message: "Not found." });
  }

  async deleteCredentials({
    credentialsId,
  }: {
    credentialsId: string;
  }): Promise<Result<void, OAuthAPIError>> {
    this.credentials.delete(credentialsId);
    return new Ok(undefined);
  }
}
