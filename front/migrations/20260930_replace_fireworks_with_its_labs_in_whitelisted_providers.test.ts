import assert from "node:assert";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import baseLogger from "@app/logger/logger";
import {
  FIREWORKS_SERVED_LABS,
  replaceFireworksWithItsLabsInWhitelistedProviders,
  restoreWhitelistsFromBackup,
} from "@app/migrations/20260930_replace_fireworks_with_its_labs_in_whitelisted_providers";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { SUPPORTED_MODEL_CONFIGS } from "@app/types/assistant/models/models";
import { getModelMaker } from "@app/types/assistant/models/providers";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";
import type { LightWorkspaceType } from "@app/types/user";
import { describe, expect, it } from "vitest";

const logger = baseLogger.child({}, { level: "silent" });

const YESTERDAY = new Date(Date.now() - 24 * 60 * 60 * 1000);

async function findWorkspace(
  workspace: LightWorkspaceType
): Promise<WorkspaceModel> {
  const row = await WorkspaceModel.findOne({ where: { id: workspace.id } });
  assert(row, `Workspace ${workspace.sId} not found`);
  return row;
}

async function readStoredWhitelist(
  workspace: LightWorkspaceType
): Promise<string[] | null> {
  const row = await findWorkspace(workspace);
  return row.whiteListedProviders;
}

// The migration scans every workspace, and the shared test database carries committed rows from
// other suites. Every assertion therefore targets the workspaces this file creates.
async function makeBackupFile(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "whitelist-backup-"));
  return join(dir, "backup.json");
}

async function runMigration(
  execute: boolean,
  workspace: LightWorkspaceType,
  backupFile?: string
) {
  const { updated, deepseekWithoutFireworks } =
    await replaceFireworksWithItsLabsInWhitelistedProviders({
      execute,
      logger,
      backupFile: backupFile ?? (await makeBackupFile()),
    });
  const change = updated.find((c) => c.workspaceId === workspace.sId);
  return {
    change: change && { before: change.before, after: change.after },
    reportedDeepseekWithoutFireworks: deepseekWithoutFireworks.includes(
      workspace.sId
    ),
  };
}

function makeWorkspace(whiteListedProviders: ModelProviderIdType[] | null) {
  return WorkspaceFactory.basic({ whiteListedProviders });
}

describe("replaceFireworksWithItsLabsInWhitelistedProviders", () => {
  it("covers the lab of every supported Fireworks model, and MiniMax", () => {
    const supportedFireworksLabs = SUPPORTED_MODEL_CONFIGS.filter(
      (config) => config.providerId === "fireworks"
    ).map(getModelMaker);

    expect(FIREWORKS_SERVED_LABS).toEqual(
      expect.arrayContaining([...supportedFireworksLabs, "minimax"])
    );
  });

  it("replaces fireworks with its labs, keeping the other entries", async () => {
    const workspace = await makeWorkspace(["openai", "fireworks", "mistral"]);
    const expected = ["openai", "mistral", ...FIREWORKS_SERVED_LABS];

    const { change } = await runMigration(true, workspace);

    expect(change).toEqual({
      before: ["openai", "fireworks", "mistral"],
      after: expected,
    });
    expect(await readStoredWhitelist(workspace)).toEqual(expected);
  });

  it("does not duplicate deepseek when it was already whitelisted next to fireworks", async () => {
    const workspace = await makeWorkspace(["deepseek", "fireworks"]);

    await runMigration(true, workspace);

    const stored = await readStoredWhitelist(workspace);
    expect(stored?.filter((entry) => entry === "deepseek")).toEqual([
      "deepseek",
    ]);
  });

  it("leaves updatedAt untouched", async () => {
    const workspace = await makeWorkspace(["fireworks"]);
    await frontSequelize.query(
      `UPDATE workspaces SET "updatedAt" = :updatedAt WHERE id = :id`,
      { replacements: { updatedAt: YESTERDAY, id: workspace.id } }
    );

    await runMigration(true, workspace);

    const { updatedAt } = await findWorkspace(workspace);
    expect(updatedAt.getTime()).toBe(YESTERDAY.getTime());
  });

  it("skips the workspace on a second run, fireworks no longer being whitelisted", async () => {
    const workspace = await makeWorkspace(["openai", "fireworks"]);

    const firstRun = await runMigration(true, workspace);
    const secondRun = await runMigration(true, workspace);

    expect(firstRun.change).toBeDefined();
    expect(secondRun.change).toBeUndefined();
  });

  it("reports a workspace whitelisting deepseek without fireworks, without rewriting it", async () => {
    const workspace = await makeWorkspace(["openai", "deepseek"]);

    const { change, reportedDeepseekWithoutFireworks } = await runMigration(
      true,
      workspace
    );

    expect(change).toBeUndefined();
    expect(reportedDeepseekWithoutFireworks).toBe(true);
    expect(await readStoredWhitelist(workspace)).toEqual([
      "openai",
      "deepseek",
    ]);
  });

  it("leaves a workspace with no whitelist untouched", async () => {
    const workspace = await makeWorkspace(null);

    const { change } = await runMigration(true, workspace);

    expect(change).toBeUndefined();
    expect(await readStoredWhitelist(workspace)).toBeNull();
  });

  it("reports the planned change without writing it when not executing", async () => {
    const workspace = await makeWorkspace(["openai", "fireworks"]);

    const { change } = await runMigration(false, workspace);

    expect(change?.after).toEqual(["openai", ...FIREWORKS_SERVED_LABS]);
    expect(await readStoredWhitelist(workspace)).toEqual([
      "openai",
      "fireworks",
    ]);
  });

  it("refuses to execute without a backup file", async () => {
    await expect(
      replaceFireworksWithItsLabsInWhitelistedProviders({
        execute: true,
        logger,
      })
    ).rejects.toThrow("--backupFile");
  });

  it("restores the original whitelist from the backup file", async () => {
    const workspace = await makeWorkspace(["openai", "fireworks"]);
    const backupFile = await makeBackupFile();

    await runMigration(true, workspace, backupFile);
    await restoreWhitelistsFromBackup({ execute: true, logger, backupFile });

    expect(await readStoredWhitelist(workspace)).toEqual([
      "openai",
      "fireworks",
    ]);
  });

  it("leaves a whitelist an admin saved after the migration untouched on rollback", async () => {
    const workspace = await makeWorkspace(["openai", "fireworks"]);
    const backupFile = await makeBackupFile();

    await runMigration(true, workspace, backupFile);
    await frontSequelize.query(
      `UPDATE workspaces SET "whiteListedProviders" = ARRAY['anthropic']::varchar(255)[] WHERE id = :id`,
      { replacements: { id: workspace.id } }
    );
    await restoreWhitelistsFromBackup({ execute: true, logger, backupFile });

    expect(await readStoredWhitelist(workspace)).toEqual(["anthropic"]);
  });
});
