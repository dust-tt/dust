import assert from "node:assert";
import { Authenticator } from "@app/lib/auth";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import baseLogger from "@app/logger/logger";
import {
  XAI_EXEMPTION_FEATURE_FLAG,
  removeXaiFromWhitelistedProviders,
} from "@app/migrations/20260917_remove_xai_from_whitelisted_providers";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";
import type { LightWorkspaceType } from "@app/types/user";
import { describe, expect, it } from "vitest";

const logger = baseLogger.child({}, { level: "silent" });

const YESTERDAY = new Date(Date.now() - 24 * 60 * 60 * 1000);

// The migration scans every workspace, and the shared test database carries committed rows from
// other suites. Every assertion therefore targets the workspaces this file creates.
async function makeWorkspaceLastEditedYesterday(
  whiteListedProviders: ModelProviderIdType[] | null
): Promise<LightWorkspaceType> {
  const workspace = await WorkspaceFactory.basic({ whiteListedProviders });
  // Raw SQL: Sequelize drops `updatedAt` from the SET clause of a bulk update, silent or not, so
  // `WorkspaceModel.update({ updatedAt })` is a no-op.
  await frontSequelize.query(
    `UPDATE workspaces SET "updatedAt" = :updatedAt WHERE id = :id`,
    { replacements: { updatedAt: YESTERDAY, id: workspace.id } }
  );
  const backdated = await findWorkspace(workspace);
  assert(
    backdated.updatedAt.getTime() === YESTERDAY.getTime(),
    `Backdating ${workspace.sId} did not stick: updatedAt is ${backdated.updatedAt.toISOString()}`
  );
  return workspace;
}

async function findWorkspace(
  workspace: LightWorkspaceType
): Promise<WorkspaceModel> {
  const row = await WorkspaceModel.findOne({ where: { id: workspace.id } });
  assert(row, `Workspace ${workspace.sId} not found`);
  return row;
}

// `togetherai` was a provider id once; rows configured back then still carry it even though the
// column validator now rejects it.
async function makeWorkspaceWithRetiredProviderLastEditedYesterday(): Promise<LightWorkspaceType> {
  const workspace = await makeWorkspaceLastEditedYesterday(["openai", "xai"]);
  await frontSequelize.query(
    `UPDATE workspaces SET "whiteListedProviders" = ARRAY['togetherai','xai']::text[] WHERE id = :id`,
    { replacements: { id: workspace.id } }
  );
  return workspace;
}

async function readStoredProviders(
  workspace: LightWorkspaceType
): Promise<string[] | null> {
  const row = await findWorkspace(workspace);
  return row.whiteListedProviders;
}

async function runMigration(
  execute: boolean,
  workspace: LightWorkspaceType
): Promise<{ before: string[]; after: string[] } | undefined> {
  const { updated } = await removeXaiFromWhitelistedProviders({
    execute,
    logger,
  });
  const change = updated.find((c) => c.workspaceId === workspace.sId);
  return change && { before: change.before, after: change.after };
}

describe("removeXaiFromWhitelistedProviders", () => {
  it("strips xai from a workspace last edited before today, keeping the other providers", async () => {
    const workspace = await makeWorkspaceLastEditedYesterday([
      "openai",
      "xai",
      "anthropic",
    ]);

    expect(await runMigration(true, workspace)).toEqual({
      before: ["openai", "xai", "anthropic"],
      after: ["openai", "anthropic"],
    });
    expect(await readStoredProviders(workspace)).toEqual([
      "openai",
      "anthropic",
    ]);
  });

  it("empties the whitelist of a workspace that only whitelisted xai", async () => {
    const workspace = await makeWorkspaceLastEditedYesterday(["xai"]);

    await runMigration(true, workspace);

    expect(await readStoredProviders(workspace)).toEqual([]);
  });

  it("leaves updatedAt untouched", async () => {
    const workspace = await makeWorkspaceLastEditedYesterday(["openai", "xai"]);

    await runMigration(true, workspace);

    const { updatedAt } = await findWorkspace(workspace);
    expect(updatedAt.getTime()).toBe(YESTERDAY.getTime());
  });

  it("skips the workspace on a second run, xai no longer being whitelisted", async () => {
    const workspace = await makeWorkspaceLastEditedYesterday(["openai", "xai"]);

    const firstRun = await runMigration(true, workspace);
    const secondRun = await runMigration(true, workspace);

    expect(firstRun).toBeDefined();
    expect(secondRun).toBeUndefined();
    expect(await readStoredProviders(workspace)).toEqual(["openai"]);
  });

  it("leaves a workspace edited today untouched", async () => {
    const workspace = await WorkspaceFactory.basic({
      whiteListedProviders: ["openai", "xai"],
    });

    expect(await runMigration(true, workspace)).toBeUndefined();
    expect(await readStoredProviders(workspace)).toEqual(["openai", "xai"]);
  });

  it("leaves a workspace that does not whitelist xai untouched", async () => {
    const workspace = await makeWorkspaceLastEditedYesterday([
      "openai",
      "anthropic",
    ]);

    expect(await runMigration(true, workspace)).toBeUndefined();
    expect(await readStoredProviders(workspace)).toEqual([
      "openai",
      "anthropic",
    ]);
  });

  it("leaves a workspace with no whitelist untouched", async () => {
    const workspace = await makeWorkspaceLastEditedYesterday(null);

    expect(await runMigration(true, workspace)).toBeUndefined();
    expect(await readStoredProviders(workspace)).toBeNull();
  });

  it("skips a workspace holding a retired provider id instead of failing the whole run", async () => {
    const retired = await makeWorkspaceWithRetiredProviderLastEditedYesterday();
    const healthy = await makeWorkspaceLastEditedYesterday(["openai", "xai"]);

    const { updated } = await removeXaiFromWhitelistedProviders({
      execute: true,
      logger,
    });

    expect(updated.map((c) => c.workspaceId)).toContain(healthy.sId);
    expect(updated.map((c) => c.workspaceId)).not.toContain(retired.sId);
    expect(await readStoredProviders(retired)).toEqual(["togetherai", "xai"]);
    expect(await readStoredProviders(healthy)).toEqual(["openai"]);
  });

  it("exempts a workspace holding the xai feature flag without exempting the others", async () => {
    const exempt = await makeWorkspaceLastEditedYesterday(["openai", "xai"]);
    const auth = await Authenticator.internalAdminForWorkspace(exempt.sId);
    await FeatureFlagFactory.legacy(auth, XAI_EXEMPTION_FEATURE_FLAG);
    const stripped = await makeWorkspaceLastEditedYesterday(["openai", "xai"]);

    const { updated } = await removeXaiFromWhitelistedProviders({
      execute: true,
      logger,
    });

    expect(updated.map((c) => c.workspaceId)).toContain(stripped.sId);
    expect(updated.map((c) => c.workspaceId)).not.toContain(exempt.sId);
    expect(await readStoredProviders(exempt)).toEqual(["openai", "xai"]);
    expect(await readStoredProviders(stripped)).toEqual(["openai"]);
  });

  it("reports the planned change without writing it when not executing", async () => {
    const workspace = await makeWorkspaceLastEditedYesterday(["openai", "xai"]);

    expect(await runMigration(false, workspace)).toEqual({
      before: ["openai", "xai"],
      after: ["openai"],
    });
    expect(await readStoredProviders(workspace)).toEqual(["openai", "xai"]);
  });
});
