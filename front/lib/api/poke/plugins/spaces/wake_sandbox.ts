import {
  isSandboxSleeping,
  wakeSleepingSandbox,
} from "@app/lib/api/poke/sandboxes";
import { createPlugin } from "@app/lib/api/poke/types";
import { ensurePodSandboxReady } from "@app/lib/api/sandbox/lifecycle";
import type { Authenticator } from "@app/lib/auth";
import { PodSandboxAdapter } from "@app/lib/resources/pod_sandbox_adapter";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { Err } from "@app/types/shared/result";

function sandboxTarget(auth: Authenticator, pod: SpaceResource) {
  return {
    ensureReady: () => ensurePodSandboxReady(auth, pod),
    fetchSandbox: () => PodSandboxAdapter.fetchSandbox(auth, pod),
  };
}

export const wakePodSandboxPlugin = createPlugin({
  manifest: {
    id: "wake-pod-sandbox",
    name: "Wake Sandbox",
    description: "Resume this pod's sleeping sandbox.",
    resourceTypes: ["spaces"],
    args: {},
    requiredRoles: ["support"],
  },
  isApplicableTo: async (auth, space) =>
    space?.isProject() ? isSandboxSleeping(sandboxTarget(auth, space)) : false,
  execute: async (auth, space) => {
    if (!space?.isProject()) {
      return new Err(new Error("Pod not found."));
    }

    return wakeSleepingSandbox(sandboxTarget(auth, space));
  },
});
