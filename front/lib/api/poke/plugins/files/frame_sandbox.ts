import {
  canRequestSandboxKill,
  isSandboxSleeping,
  requestSandboxKill,
  wakeSleepingSandbox,
} from "@app/lib/api/poke/sandboxes";
import { createPlugin } from "@app/lib/api/poke/types";
import { ensureFrameSandboxReady } from "@app/lib/api/sandbox/lifecycle";
import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import { FrameSandboxAdapter } from "@app/lib/resources/frame_sandbox_adapter";
import { Err } from "@app/types/shared/result";

function sandboxTarget(auth: Authenticator, frame: FileResource) {
  return {
    ensureReady: () => ensureFrameSandboxReady(auth, frame),
    fetchSandbox: () => FrameSandboxAdapter.fetchSandbox(auth, frame),
  };
}

export const wakeFrameSandboxPlugin = createPlugin({
  manifest: {
    id: "wake-frame-sandbox",
    name: "Wake Sandbox",
    description: "Resume this Frame's sleeping sandbox.",
    resourceTypes: ["files"],
    args: {},
    requiredRoles: ["support"],
  },
  isApplicableTo: async (auth, file) =>
    file?.isFrameV2 ? isSandboxSleeping(sandboxTarget(auth, file)) : false,
  execute: async (auth, file) => {
    if (!file?.isFrameV2) {
      return new Err(new Error("Frame not found."));
    }

    return wakeSleepingSandbox(sandboxTarget(auth, file));
  },
});

export const requestFrameSandboxKillPlugin = createPlugin({
  manifest: {
    id: "request-frame-sandbox-kill",
    name: "Request Sandbox Kill",
    description:
      "Mark this Frame's sandbox for destruction and recreation on its next access.",
    warning:
      "The sandbox will be destroyed. Frame databases will be restored from replicated state when it is recreated.",
    resourceTypes: ["files"],
    args: {},
    requiredRoles: ["support"],
  },
  isApplicableTo: async (auth, file) =>
    file?.isFrameV2 ? canRequestSandboxKill(sandboxTarget(auth, file)) : false,
  execute: async (auth, file) => {
    if (!file?.isFrameV2) {
      return new Err(new Error("Frame not found."));
    }

    return requestSandboxKill(sandboxTarget(auth, file));
  },
});
