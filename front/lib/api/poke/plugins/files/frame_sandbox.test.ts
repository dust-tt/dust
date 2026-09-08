import { pluginManager } from "@app/lib/api/poke/plugin_manager";
import {
  requestFrameSandboxKillPlugin,
  wakeFrameSandboxPlugin,
} from "@app/lib/api/poke/plugins/files/frame_sandbox";
import { FrameSandboxAdapter } from "@app/lib/resources/frame_sandbox_adapter";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SandboxFactory } from "@app/tests/utils/SandboxFactory";
import { frameV2ContentType } from "@app/types/files";
import { describe, expect, it } from "vitest";

async function setupFrame() {
  const { authenticator: auth, user } = await createResourceTest({
    role: "admin",
  });
  const frame = await FileFactory.create(auth, user, {
    contentType: frameV2ContentType,
    fileName: "manifest.json",
    fileSize: 100,
    status: "ready",
    useCase: "conversation",
  });

  return { auth, frame };
}

describe("Frame sandbox plugins", () => {
  it("registers both Frame sandbox plugins", () => {
    expect(pluginManager.getPluginById("request-frame-sandbox-kill")).toBe(
      requestFrameSandboxKillPlugin
    );
    expect(pluginManager.getPluginById("wake-frame-sandbox")).toBe(
      wakeFrameSandboxPlugin
    );
  });

  it("offers wake only for an unmarked sleeping sandbox", async () => {
    const { auth, frame } = await setupFrame();
    await SandboxFactory.createForFrame(auth, frame, { status: "sleeping" });

    await expect(
      wakeFrameSandboxPlugin.isApplicableTo(auth, frame)
    ).resolves.toBe(true);

    const sandbox = await FrameSandboxAdapter.fetchSandbox(auth, frame);
    await sandbox?.requestKill();

    await expect(
      wakeFrameSandboxPlugin.isApplicableTo(auth, frame)
    ).resolves.toBe(false);
  });

  it("requests a kill for the Frame sandbox", async () => {
    const { auth, frame } = await setupFrame();
    await SandboxFactory.createForFrame(auth, frame);

    const result = await requestFrameSandboxKillPlugin.execute(auth, frame, {});

    expect(result.isOk()).toBe(true);
    const sandbox = await FrameSandboxAdapter.fetchSandbox(auth, frame);
    expect(sandbox?.killRequestedAt).toEqual(expect.any(Date));
  });

  it("does not offer either plugin when the Frame has no sandbox", async () => {
    const { auth, frame } = await setupFrame();

    await expect(
      wakeFrameSandboxPlugin.isApplicableTo(auth, frame)
    ).resolves.toBe(false);
    await expect(
      requestFrameSandboxKillPlugin.isApplicableTo(auth, frame)
    ).resolves.toBe(false);
  });
});
