import { Err, Ok } from "@app/types/shared/result";
import { randomUUID } from "crypto";

type StoredCredential = {
  provider: string;
  content: unknown;
};

// Stands in for the core OAuth service's credential endpoints: what is posted can be read back
// and deleted, so tests observe the stored secrets instead of mock call arguments.
export class InMemoryOAuthAPI {
  static readonly credentials = new Map<string, StoredCredential>();

  static reset() {
    InMemoryOAuthAPI.credentials.clear();
  }

  async postCredentials({
    provider,
    credentials,
  }: {
    provider: string;
    credentials: unknown;
  }) {
    // Unique across runs: callers may cache secrets in Redis keyed by credential id.
    const credentialId = `cred-${provider}-${randomUUID()}`;
    InMemoryOAuthAPI.credentials.set(credentialId, {
      provider,
      content: credentials,
    });
    return new Ok({
      credential: { credential_id: credentialId, provider, created: 0 },
    });
  }

  async getCredentials({ credentialsId }: { credentialsId: string }) {
    const stored = InMemoryOAuthAPI.credentials.get(credentialsId);
    if (!stored) {
      return new Err({ code: "not_found", message: "Credential not found" });
    }
    return new Ok({
      credential: {
        credential_id: credentialsId,
        provider: stored.provider,
        content: stored.content,
      },
    });
  }

  async deleteCredentials({ credentialsId }: { credentialsId: string }) {
    InMemoryOAuthAPI.credentials.delete(credentialsId);
    return new Ok(undefined);
  }
}
