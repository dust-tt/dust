import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadAllowedRemoteDatabaseCredential } from "./remote_database_credential";

const { getCredentialsMock } = vi.hoisted(() => ({
  getCredentialsMock: vi.fn(),
}));

vi.mock("@app/types/oauth/oauth_api", () => ({
  OAuthAPI: class {
    getCredentials = getCredentialsMock;
  },
}));

const WORKSPACE_ID = "workspace-a";

const snowflakeKeyPair = {
  username: "loader",
  account: "ab12345",
  role: "READER",
  warehouse: "WH",
  auth_type: "keypair" as const,
  private_key: "private-key",
};

const snowflakePassword = {
  username: "loader",
  account: "ab12345",
  role: "READER",
  warehouse: "WH",
  password: "secret",
};

const bigQuery = {
  type: "service_account",
  project_id: "project",
  private_key_id: "key-id",
  private_key: "private-key",
  client_email: "loader@project.iam.gserviceaccount.com",
  client_id: "1",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url:
    "https://www.googleapis.com/robot/v1/metadata/x509/loader",
  universe_domain: "googleapis.com",
  location: "US",
};

function credential({
  workspaceId = WORKSPACE_ID,
  provider = "snowflake",
  content = snowflakeKeyPair,
}: {
  workspaceId?: string;
  provider?: string;
  content?: unknown;
} = {}) {
  return new Ok({
    credential: {
      credential_id: "cred_test",
      created: 1,
      provider,
      metadata: { workspace_id: workspaceId, user_id: "user" },
      content,
    },
  });
}

describe("loadAllowedRemoteDatabaseCredential", () => {
  beforeEach(() => {
    getCredentialsMock.mockReset();
  });

  it("accepts a snowflake key-pair credential for the caller's workspace", async () => {
    getCredentialsMock.mockResolvedValue(credential());

    const result = await loadAllowedRemoteDatabaseCredential({
      credentialsId: "cred_test",
      workspaceId: WORKSPACE_ID,
      allowedUses: ["snowflake_keypair"],
    });

    expect(result.isOk()).toBe(true);
  });

  it("rejects a credential minted for another workspace", async () => {
    getCredentialsMock.mockResolvedValue(
      credential({ workspaceId: "workspace-b" })
    );

    const result = await loadAllowedRemoteDatabaseCredential({
      credentialsId: "cred_test",
      workspaceId: WORKSPACE_ID,
      allowedUses: ["snowflake_keypair"],
    });

    expect(result).toEqual(new Err("rejected"));
  });

  it("rejects a credential whose provider is not an allowed use", async () => {
    getCredentialsMock.mockResolvedValue(
      credential({
        provider: "slack",
        content: { client_id: "a", client_secret: "b" },
      })
    );

    const result = await loadAllowedRemoteDatabaseCredential({
      credentialsId: "cred_test",
      workspaceId: WORKSPACE_ID,
      allowedUses: ["snowflake", "bigquery"],
    });

    expect(result).toEqual(new Err("rejected"));
  });

  it("rejects a snowflake password credential when only a key-pair is allowed", async () => {
    getCredentialsMock.mockResolvedValue(
      credential({ content: snowflakePassword })
    );

    const result = await loadAllowedRemoteDatabaseCredential({
      credentialsId: "cred_test",
      workspaceId: WORKSPACE_ID,
      allowedUses: ["snowflake_keypair"],
    });

    expect(result).toEqual(new Err("rejected"));
  });

  it("accepts a snowflake password credential for connector-style snowflake use", async () => {
    getCredentialsMock.mockResolvedValue(
      credential({ content: snowflakePassword })
    );

    const result = await loadAllowedRemoteDatabaseCredential({
      credentialsId: "cred_test",
      workspaceId: WORKSPACE_ID,
      allowedUses: ["snowflake", "bigquery"],
    });

    expect(result.isOk()).toBe(true);
  });

  it("accepts a bigquery service-account credential", async () => {
    getCredentialsMock.mockResolvedValue(
      credential({ provider: "bigquery", content: bigQuery })
    );

    const result = await loadAllowedRemoteDatabaseCredential({
      credentialsId: "cred_test",
      workspaceId: WORKSPACE_ID,
      allowedUses: ["snowflake", "bigquery"],
    });

    expect(result.isOk()).toBe(true);
  });

  it("reports oauth outages as unavailable", async () => {
    getCredentialsMock.mockResolvedValue(
      new Err({
        code: "unexpected_network_error",
        message: "down",
      })
    );

    const result = await loadAllowedRemoteDatabaseCredential({
      credentialsId: "cred_test",
      workspaceId: WORKSPACE_ID,
      allowedUses: ["snowflake_keypair"],
    });

    expect(result).toEqual(new Err("unavailable"));
  });
});
