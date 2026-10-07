import { Err, Ok } from "@app/types/shared/result";

type StoredCredential = {
  provider: string;
  content: unknown;
};

// Stands in for the core OAuth service's credential endpoints: what is posted can be read back
// and deleted, so tests observe the stored secrets instead of mock call arguments.
export class InMemoryOAuthAPI {
  static readonly credentials = new Map<string, StoredCredential>();
  private static nextId = 0;

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
    InMemoryOAuthAPI.nextId += 1;
    const credentialId = `cred-${provider}-${InMemoryOAuthAPI.nextId}`;
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
