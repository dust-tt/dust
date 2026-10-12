import config from "@app/lib/api/config";
import { SandboxEnvVarModel } from "@app/lib/resources/storage/models/sandbox_env_var";
import {
  deleteStagedSecretsInDestinationRegion,
  reencryptSecretsInDestinationRegion,
} from "@app/temporal/relocation/activities/destination_region/front/secrets";
import { readSecretsFromSourceRegion } from "@app/temporal/relocation/activities/source_region/front/secrets";
import type * as RelocationStorage from "@app/temporal/relocation/lib/file_storage/relocation";
import { DustAppSecretFactory } from "@app/tests/utils/DustAppSecretFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { InternalMCPServerCredentialFactory } from "@app/tests/utils/InternalMCPServerCredentialFactory";
import { SandboxEnvVarFactory } from "@app/tests/utils/SandboxEnvVarFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { decrypt, encrypt } from "@app/types/shared/utils/encryption";
import { randomUUID } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { stagedObjects } = vi.hoisted(() => ({
  stagedObjects: new Map<string, string>(),
}));

// Keeps the real path construction and swaps the bucket for an in-memory map.
vi.mock(
  "@app/temporal/relocation/lib/file_storage/relocation",
  async (importOriginal) => {
    const actual = await importOriginal<typeof RelocationStorage>();
    return {
      ...actual,
      writeToRelocationStorage: vi.fn(
        async (
          data: unknown,
          options: Parameters<typeof actual.writeToRelocationStorage>[1]
        ) => {
          // Unnamed objects get a unique path, as timestamps do in production.
          const path = actual.getRelocationStoragePath({
            ...options,
            fileName: options.fileName ?? randomUUID(),
          });
          stagedObjects.set(path, JSON.stringify(data));
          return path;
        }
      ),
      readFromRelocationStorage: vi.fn(async (path: string) =>
        JSON.parse(stagedObjects.get(path) ?? "null")
      ),
      deleteFromRelocationStorage: vi.fn(async (path: string) => {
        stagedObjects.delete(path);
      }),
    };
  }
);

const CELLS = { destCell: "cell-00001", sourceCell: "cell-00000" } as const;

// Each cell encrypts with its own secrets; switching them simulates running in the other cell.
function setCellSecrets(cell: "source" | "destination") {
  vi.spyOn(config, "getMCPServerCredentialsSecret").mockReturnValue(
    `${cell}-mcp-secret`
  );
  vi.spyOn(config, "getDeveloperSecretsSecret").mockReturnValue(
    `${cell}-developer-secret`
  );
}

async function seedSecrets() {
  const { authenticator, user, workspace } = await createResourceTest({
    role: "admin",
  });
  const pod = await SpaceFactory.project(workspace, user.id);

  setCellSecrets("source");
  const mcpCredential = await InternalMCPServerCredentialFactory.create(
    authenticator,
    {
      internalMCPServerId: "ims_test",
      encryptedKey: encrypt({
        text: "front-api-key",
        key: workspace.sId,
        useCase: "mcp_server_credentials",
      }),
    }
  );
  const dustAppSecret = await DustAppSecretFactory.create(authenticator, {
    name: "APP_SECRET",
    hash: encrypt({
      text: "app-secret-value",
      key: workspace.sId,
      useCase: "developer_secret",
    }),
  });
  const workspaceEnvVar = await SandboxEnvVarFactory.create(authenticator, {
    name: "WORKSPACE_VAR",
    encryptedValue: encrypt({
      text: "workspace-var-value",
      key: workspace.sId,
      useCase: "developer_secret",
    }),
  });
  const podEnvVar = await SandboxEnvVarFactory.create(authenticator, {
    name: "POD_VAR",
    space: pod,
    encryptedValue: encrypt({
      text: "pod-var-value",
      key: pod.sId,
      useCase: "developer_secret",
    }),
  });

  return {
    workspace,
    pod,
    mcpCredential,
    dustAppSecret,
    workspaceEnvVar,
    podEnvVar,
  };
}

describe("relocation secrets re-encryption", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    stagedObjects.clear();
  });

  it("re-encrypts every listed secret so the destination cell secrets decrypt it", async () => {
    const {
      workspace,
      pod,
      mcpCredential,
      dustAppSecret,
      workspaceEnvVar,
      podEnvVar,
    } = await seedSecrets();

    const dataPath = await readSecretsFromSourceRegion({
      ...CELLS,
      workspaceId: workspace.sId,
    });
    expect(dataPath).not.toBeNull();

    setCellSecrets("destination");
    await reencryptSecretsInDestinationRegion({
      ...CELLS,
      dataPath: dataPath!,
      workspaceId: workspace.sId,
    });

    await mcpCredential.reload();
    await dustAppSecret.reload();
    await workspaceEnvVar.reload();
    await podEnvVar.reload();

    expect(
      decrypt({
        encrypted: mcpCredential.encryptedKey!,
        key: workspace.sId,
        useCase: "mcp_server_credentials",
      })
    ).toBe("front-api-key");
    expect(
      decrypt({
        encrypted: dustAppSecret.hash,
        key: workspace.sId,
        useCase: "developer_secret",
      })
    ).toBe("app-secret-value");
    expect(
      decrypt({
        encrypted: workspaceEnvVar.encryptedValue,
        key: workspace.sId,
        useCase: "developer_secret",
      })
    ).toBe("workspace-var-value");
    expect(
      decrypt({
        encrypted: podEnvVar.encryptedValue,
        key: pod.sId,
        useCase: "developer_secret",
      })
    ).toBe("pod-var-value");

    await deleteStagedSecretsInDestinationRegion({ dataPath: dataPath! });
    expect(stagedObjects.size).toBe(0);
  });

  it("never stages plaintext or source-encrypted values", async () => {
    const {
      workspace,
      mcpCredential,
      dustAppSecret,
      workspaceEnvVar,
      podEnvVar,
    } = await seedSecrets();

    const dataPath = await readSecretsFromSourceRegion({
      ...CELLS,
      workspaceId: workspace.sId,
    });

    const staged = stagedObjects.get(dataPath!) ?? "";
    for (const forbidden of [
      "front-api-key",
      "app-secret-value",
      "workspace-var-value",
      "pod-var-value",
      mcpCredential.encryptedKey!,
      dustAppSecret.hash,
      workspaceEnvVar.encryptedValue,
      podEnvVar.encryptedValue,
    ]) {
      expect(staged).not.toContain(forbidden);
    }
  });

  it("stages nothing and returns null when the workspace has no secrets", async () => {
    const { workspace } = await createResourceTest({ role: "admin" });

    const dataPath = await readSecretsFromSourceRegion({
      ...CELLS,
      workspaceId: workspace.sId,
    });

    expect(dataPath).toBeNull();
    expect(stagedObjects.size).toBe(0);
  });

  it("fails naming the row, without its value, when a source secret cannot be decrypted", async () => {
    const { workspace, dustAppSecret } = await seedSecrets();
    await dustAppSecret.update({ hash: "deadbeef" });

    const result = readSecretsFromSourceRegion({
      ...CELLS,
      workspaceId: workspace.sId,
    });
    await expect(result).rejects.toThrow(
      `dust_app_secrets row ${dustAppSecret.id}`
    );
    await expect(result).rejects.not.toThrow("deadbeef");
    expect(stagedObjects.size).toBe(0);
  });

  it("updates no row and keeps the staged object when a staged row is missing", async () => {
    const {
      workspace,
      mcpCredential,
      dustAppSecret,
      workspaceEnvVar,
      podEnvVar,
    } = await seedSecrets();

    const dataPath = await readSecretsFromSourceRegion({
      ...CELLS,
      workspaceId: workspace.sId,
    });
    const sourceValues = {
      mcpCredential: mcpCredential.encryptedKey,
      dustAppSecret: dustAppSecret.hash,
      podEnvVar: podEnvVar.encryptedValue,
    };
    await SandboxEnvVarModel.destroy({
      where: { id: workspaceEnvVar.id, workspaceId: workspace.id },
    });

    setCellSecrets("destination");
    await expect(
      reencryptSecretsInDestinationRegion({
        ...CELLS,
        dataPath: dataPath!,
        workspaceId: workspace.sId,
      })
    ).rejects.toThrow("workspace_sandbox_env_vars");

    await mcpCredential.reload();
    await dustAppSecret.reload();
    await podEnvVar.reload();
    expect({
      mcpCredential: mcpCredential.encryptedKey,
      dustAppSecret: dustAppSecret.hash,
      podEnvVar: podEnvVar.encryptedValue,
    }).toEqual(sourceValues);
    expect(stagedObjects.has(dataPath!)).toBe(true);

    await deleteStagedSecretsInDestinationRegion({ dataPath: dataPath! });
    expect(stagedObjects.has(dataPath!)).toBe(false);
  });

  it("stages retries under the same object path", async () => {
    const { workspace } = await seedSecrets();

    const first = await readSecretsFromSourceRegion({
      ...CELLS,
      workspaceId: workspace.sId,
    });
    const second = await readSecretsFromSourceRegion({
      ...CELLS,
      workspaceId: workspace.sId,
    });

    expect(second).toBe(first);
    expect(stagedObjects.size).toBe(1);
  });

  it("can be re-run after a successful re-encryption", async () => {
    const { workspace, dustAppSecret } = await seedSecrets();

    const dataPath = await readSecretsFromSourceRegion({
      ...CELLS,
      workspaceId: workspace.sId,
    });

    setCellSecrets("destination");
    const params = {
      ...CELLS,
      dataPath: dataPath!,
      workspaceId: workspace.sId,
    };
    await reencryptSecretsInDestinationRegion(params);
    await reencryptSecretsInDestinationRegion(params);

    await dustAppSecret.reload();
    expect(
      decrypt({
        encrypted: dustAppSecret.hash,
        key: workspace.sId,
        useCase: "developer_secret",
      })
    ).toBe("app-secret-value");
  });
});
