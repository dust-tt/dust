import type { PluginResponse } from "@app/lib/api/poke/types";
import type { EnsureSandboxReadyResult } from "@app/lib/api/sandbox/lifecycle";
import { makeSandboxConnectCommand } from "@app/lib/poke/sandbox";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

type SandboxTarget = {
  fetchSandbox: () => Promise<SandboxResource | null>;
};

type SandboxWakeTarget = SandboxTarget & {
  // Must go through the owner-specific ready helper, not the owner adapter:
  // waking through the adapter skips the GCS mount and egress bring-up.
  ensureReady: () => Promise<Result<EnsureSandboxReadyResult, Error>>;
};

export async function isSandboxSleeping({
  fetchSandbox,
}: Pick<SandboxWakeTarget, "fetchSandbox">): Promise<boolean> {
  const sandbox = await fetchSandbox();

  return sandbox?.status === "sleeping" && sandbox.killRequestedAt === null;
}

/**
 * @cc [owner:davidebbo,label:product] wake-only-unmarked-sleeping-sandbox
 * `wakeSleepingSandbox` must only call the owner ready helper for an existing sleeping sandbox
 * without a pending kill request.
 */
export async function wakeSleepingSandbox({
  ensureReady,
  fetchSandbox,
}: SandboxWakeTarget): Promise<Result<PluginResponse, Error>> {
  const sandbox = await fetchSandbox();
  if (!sandbox) {
    return new Err(new Error("No sandbox to wake."));
  }
  if (sandbox.killRequestedAt) {
    return new Err(
      new Error("Sandbox has a pending kill request and cannot be woken.")
    );
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

type SandboxSleepTarget = SandboxTarget & {
  // Must go through the owner adapter's sleep helper, which holds the lifecycle
  // lock and runs the owner's pre-sleep state check.
  sleepIfRunning: () => Promise<Result<void, Error>>;
};

export async function isSandboxRunning({
  fetchSandbox,
}: SandboxTarget): Promise<boolean> {
  const sandbox = await fetchSandbox();

  return sandbox?.status === "running" && sandbox.killRequestedAt === null;
}

/**
 * @cc [owner:davidebbo,label:product] sleep-only-unmarked-running-sandbox
 * `sleepRunningSandbox` must only call the owner sleep helper for an existing running sandbox
 * without a pending kill request; it must never create, wake, or destroy a sandbox.
 */
export async function sleepRunningSandbox({
  fetchSandbox,
  sleepIfRunning,
}: SandboxSleepTarget): Promise<Result<PluginResponse, Error>> {
  const sandbox = await fetchSandbox();
  if (!sandbox) {
    return new Err(new Error("No sandbox to put to sleep."));
  }
  if (sandbox.killRequestedAt) {
    return new Err(
      new Error("Sandbox has a pending kill request and cannot be slept.")
    );
  }
  if (sandbox.status !== "running") {
    return new Err(
      new Error(`Sandbox is ${sandbox.status}, not running — nothing to sleep.`)
    );
  }

  const sleepResult = await sleepIfRunning();
  if (sleepResult.isErr()) {
    return new Err(sleepResult.error);
  }

  // The owner helper re-checks the status under the lifecycle lock and returns Ok without
  // sleeping when it changed, or marks the sandbox deleted if the provider lost it, so
  // report the status it actually landed in.
  const slept = await fetchSandbox();
  if (!slept) {
    return new Err(new Error("Sandbox disappeared while being put to sleep."));
  }

  return new Ok({
    display: "text",
    value: `Sandbox is now ${slept.status}.`,
  });
}

export async function canRequestSandboxKill({
  fetchSandbox,
}: SandboxTarget): Promise<boolean> {
  const sandbox = await fetchSandbox();

  return (
    sandbox !== null &&
    sandbox.status !== "deleted" &&
    sandbox.killRequestedAt === null
  );
}

/**
 * @cc [owner:davidebbo,label:product] request-existing-sandbox-kill
 * `requestSandboxKill` must only mark an existing, non-deleted sandbox without a pending kill; it
 * must never create, wake, or destroy a sandbox synchronously.
 */
export async function requestSandboxKill({
  fetchSandbox,
}: SandboxTarget): Promise<Result<PluginResponse, Error>> {
  const sandbox = await fetchSandbox();
  if (!sandbox) {
    return new Err(new Error("No sandbox to kill."));
  }
  if (sandbox.status === "deleted") {
    return new Err(new Error("Sandbox is already deleted."));
  }
  if (sandbox.killRequestedAt) {
    return new Err(new Error("A sandbox kill is already requested."));
  }

  await sandbox.requestKill();

  return new Ok({
    display: "text",
    value:
      "Sandbox kill requested. The reaper will destroy it, or the next access will destroy and recreate it.",
  });
}
