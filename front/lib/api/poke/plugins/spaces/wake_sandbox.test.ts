import { wakePodSandboxPlugin } from "@app/lib/api/poke/plugins/spaces/wake_sandbox";
import { Authenticator } from "@app/lib/auth";
import { SandboxFactory } from "@app/tests/utils/SandboxFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { describe, expect, it } from "vitest";

async function setup() {
  const workspace = await WorkspaceFactory.basic();
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const pod = await SpaceFactory.project(workspace);

  return { auth, pod, workspace };
}

describe("wakePodSandboxPlugin", () => {
  it("is applicable when the pod sandbox is sleeping", async () => {
    const { auth, pod } = await setup();
    await SandboxFactory.createForPod(auth, pod, { status: "sleeping" });

    await expect(wakePodSandboxPlugin.isApplicableTo(auth, pod)).resolves.toBe(
      true
    );
  });

  it("is not applicable when the pod sandbox is already running", async () => {
    const { auth, pod } = await setup();
    await SandboxFactory.createForPod(auth, pod, { status: "running" });

    await expect(wakePodSandboxPlugin.isApplicableTo(auth, pod)).resolves.toBe(
      false
    );
  });

  it("is not applicable when the pod has no sandbox", async () => {
    const { auth, pod } = await setup();

    await expect(wakePodSandboxPlugin.isApplicableTo(auth, pod)).resolves.toBe(
      false
    );
  });

  it("is not applicable to a regular space", async () => {
    const { workspace, auth } = await setup();
    const space = await SpaceFactory.regular(workspace);

    await expect(
      wakePodSandboxPlugin.isApplicableTo(auth, space)
    ).resolves.toBe(false);
  });

  // Waking provisions nothing: a sandbox in any other status is refused before
  // the ready helper (and therefore the provider) is ever reached.
  it("refuses to wake a sandbox that is not sleeping", async () => {
    const { auth, pod } = await setup();
    await SandboxFactory.createForPod(auth, pod, { status: "deleted" });

    const result = await wakePodSandboxPlugin.execute(auth, pod, {});

    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error.message).toContain("not sleeping");
  });

  it("errors when the pod has no sandbox", async () => {
    const { auth, pod } = await setup();

    const result = await wakePodSandboxPlugin.execute(auth, pod, {});

    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error.message).toContain(
      "No sandbox to wake"
    );
  });
});
