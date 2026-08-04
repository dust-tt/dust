import type { PluginResponse } from "@app/lib/api/poke/types";
import type { EnsureSandboxReadyResult } from "@app/lib/api/sandbox/lifecycle";
import { makeSandboxConnectCommand } from "@app/lib/poke/sandbox";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

type SandboxWakeTarget = {
  // Must go through the owner-specific ready helper, not the owner adapter:
  // waking through the adapter skips the GCS mount and egress bring-up.
  ensureReady: () => Promise<Result<EnsureSandboxReadyResult, Error>>;
  fetchSandbox: () => Promise<SandboxResource | null>;
};

export async function isSandboxSleeping({
  fetchSandbox,
}: Pick<SandboxWakeTarget, "fetchSandbox">): Promise<boolean> {
  const sandbox = await fetchSandbox();

  return sandbox?.status === "sleeping";
}

export async function wakeSleepingSandbox({
  ensureReady,
  fetchSandbox,
}: SandboxWakeTarget): Promise<Result<PluginResponse, Error>> {
  const sandbox = await fetchSandbox();
  if (!sandbox) {
    return new Err(new Error("No sandbox to wake."));
  }

  // The ready helper would create a sandbox from scratch if there were none, and
  // resume anything that is merely paused. Waking is only meaningful for a
  // sleeping one, so refuse every other status rather than provisioning.
  if (sandbox.status !== "sleeping") {
    return new Err(
      new Error(`Sandbox is ${sandbox.status}, not sleeping — nothing to wake.`)
    );
  }

  const readyResult = await ensureReady();
  if (readyResult.isErr()) {
    return new Err(readyResult.error);
  }

  const woken = readyResult.value.sandbox;

  return new Ok({
    display: "text",
    value:
      `Sandbox is now ${woken.status}. Connect with: ` +
      makeSandboxConnectCommand(woken.toPokeJSON()),
  });
}
