import { pluginManager } from "@app/lib/api/poke/plugin_manager";
import {
  requestFrameSandboxKillPlugin,
  sleepFrameSandboxPlugin,
  wakeFrameSandboxPlugin,
} from "@app/lib/api/poke/plugins/files/frame_sandbox";
import { FrameSandboxAdapter } from "@app/lib/resources/frame_sandbox_adapter";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SandboxFactory } from "@app/tests/utils/SandboxFactory";
import { frameV2ContentType } from "@app/types/files";
import { Ok } from "@app/types/shared/result";
import { describe, expect, it, vi } from "vitest";

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
  it("registers all Frame sandbox plugins", () => {
    expect(pluginManager.getPluginById("request-frame-sandbox-kill")).toBe(
      requestFrameSandboxKillPlugin
    );
    expect(pluginManager.getPluginById("wake-frame-sandbox")).toBe(
      wakeFrameSandboxPlugin
    );
    expect(pluginManager.getPluginById("sleep-frame-sandbox")).toBe(
      sleepFrameSandboxPlugin
    );
  });

  it("offers sleep only for an unmarked running sandbox", async () => {
    const { auth, frame } = await setupFrame();
    await SandboxFactory.createForFrame(auth, frame);

    await expect(
      sleepFrameSandboxPlugin.isApplicableTo(auth, frame)
    ).resolves.toBe(true);

    const sandbox = await FrameSandboxAdapter.fetchSandbox(auth, frame);
    await sandbox?.requestKill();

    await expect(
      sleepFrameSandboxPlugin.isApplicableTo(auth, frame)
    ).resolves.toBe(false);
  });

  it("sleeps a running Frame sandbox through the adapter", async () => {
    const { auth, frame } = await setupFrame();
    const sandbox = await SandboxFactory.createForFrame(auth, frame);
    const sleepSpy = vi
      .spyOn(FrameSandboxAdapter, "dangerouslySleepSandboxIfRunning")
      .mockImplementation(async () => {
        await sandbox.updateStatus("sleeping");
        return new Ok(undefined);
      });

    const result = await sleepFrameSandboxPlugin.execute(auth, frame, {});

    expect(sleepSpy).toHaveBeenCalledOnce();
    expect(result.isOk() && result.value).toEqual({
      display: "text",
      value: "Sandbox is now sleeping.",
    });
    sleepSpy.mockRestore();
  });

  it("refuses to sleep a sandbox that is not running", async () => {
    const { auth, frame } = await setupFrame();
    await SandboxFactory.createForFrame(auth, frame, { status: "sleeping" });
    const sleepSpy = vi.spyOn(
      FrameSandboxAdapter,
      "dangerouslySleepSandboxIfRunning"
    );

    const result = await sleepFrameSandboxPlugin.execute(auth, frame, {});

    expect(result.isErr()).toBe(true);
    expect(sleepSpy).not.toHaveBeenCalled();
    sleepSpy.mockRestore();
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

  it("does not offer any plugin when the Frame has no sandbox", async () => {
    const { auth, frame } = await setupFrame();

    await expect(
      sleepFrameSandboxPlugin.isApplicableTo(auth, frame)
    ).resolves.toBe(false);

    await expect(
      wakeFrameSandboxPlugin.isApplicableTo(auth, frame)
    ).resolves.toBe(false);
    await expect(
      requestFrameSandboxKillPlugin.isApplicableTo(auth, frame)
    ).resolves.toBe(false);
  });
});
