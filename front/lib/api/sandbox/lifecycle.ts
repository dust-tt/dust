import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import {
  ensureSandboxEgressOnExec,
  prepareSandboxEgressBeforeMount,
} from "@app/lib/api/sandbox/egress";
import { getSandboxImage } from "@app/lib/api/sandbox/image";
import {
  recordSandboxStartupTotal,
  traceSandboxStartupPhase,
} from "@app/lib/api/sandbox/instrumentation";
import type { SandboxRuntimeOwner } from "@app/lib/api/sandbox/owner";
import { podSandboxOnlyMounts } from "@app/lib/api/sandbox/pod_mounts";
import { setupPodStateOnColdStart } from "@app/lib/api/sandbox/pod_state";
import { startTelemetry } from "@app/lib/api/sandbox/telemetry";
import type { Authenticator } from "@app/lib/auth";
import { ConversationSandboxAdapter } from "@app/lib/resources/conversation_sandbox_adapter";
import { PodSandboxAdapter } from "@app/lib/resources/pod_sandbox_adapter";
import type {
  EnsureSandboxResult,
  SandboxResource,
} from "@app/lib/resources/sandbox_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import type { ConversationType } from "@app/types/assistant/conversation";
import { Ok, type Result } from "@app/types/shared/result";

export interface EnsureSandboxReadyResult {
  sandbox: SandboxResource;
  freshlyCreated: boolean;
}

type SandboxReadyConfig = {
  ensureActive: () => Promise<Result<EnsureSandboxResult, Error>>;
  getFileSystem: () => Promise<Result<DustFileSystem, Error>>;
  runtimeOwner: SandboxRuntimeOwner;
};

// /!\ All sandbox-touching tools must use the owner-specific ready helper rather than calling
// the owner adapter directly, otherwise the GCS FUSE mount and egress forwarder bring-up will be
// skipped.
async function ensureOwnerSandboxReady(
  auth: Authenticator,
  { ensureActive, getFileSystem, runtimeOwner }: SandboxReadyConfig
): Promise<Result<EnsureSandboxReadyResult, Error>> {
  const startMs = performance.now();
  // cold is unknown until ensureActive returns; if it errors first (rare) we
  // record the failure as a warm attempt.
  let cold = false;
  let status: "success" | "error" = "success";

  try {
    return await traceSandboxStartupPhase("total", async () => {
      const ensureResult = await traceSandboxStartupPhase(
        "provider_ensure",
        ensureActive
      );
      if (ensureResult.isErr()) {
        status = "error";
        return ensureResult;
      }

      const { sandbox, freshlyCreated, wokeFromSleep } = ensureResult.value;
      cold = freshlyCreated;

      // Synchronous and cheap: not worth a span (it would always read ~0ms).
      const imageResult = getSandboxImage(auth);
      if (imageResult.isErr()) {
        logger.error(
          { err: imageResult.error },
          "Failed to get sandbox image for GCS mount"
        );
        status = "error";
        return imageResult;
      }
      const image = imageResult.value;

      void startTelemetry(auth, sandbox, runtimeOwner).catch((err) =>
        logger.error({ err }, "Telemetry start failed (fire-and-forget)")
      );

      // Only mount on first creation. e2b preserves the FUSE mount and the
      // token server across betaPause + connect (verified empirically), so on
      // wake we just need a fresh GCS access token in /tmp/token.json (the
      // running token server will hand it to gcsfuse on the next request).
      if (freshlyCreated) {
        // The image seeds /etc/dust/ca-bundle.pem with system roots, and
        // gcsfuse runs as root to storage.googleapis.com, which the in-sandbox
        // nftables ruleset never touches: every rule is scoped to the agent uid
        // (1003) and the chains default to accept, so root egress is never
        // dropped, even mid-setup. The dev-unrestricted branch only tears the
        // table down (loosening egress further), so it's safe to overlap too.
        // Egress prep can therefore run alongside the GCS mount, with egress
        // errors still taking precedence.
        const [prepResult, mountResult] = await Promise.all([
          traceSandboxStartupPhase("egress_prep", () =>
            prepareSandboxEgressBeforeMount(auth, sandbox, { runtimeOwner })
          ),
          traceSandboxStartupPhase("gcs_mount", async () => {
            const fsResult = await getFileSystem();
            if (fsResult.isErr()) {
              return fsResult;
            }
            return fsResult.value.setupSandboxMount(sandbox, image);
          }),
        ]);
        if (prepResult.isErr()) {
          status = "error";
          return prepResult;
        }
        if (mountResult.isErr()) {
          status = "error";
          return mountResult;
        }
      } else {
        const refreshResult = await traceSandboxStartupPhase(
          "gcs_refresh",
          async () => {
            const fsResult = await getFileSystem();
            if (fsResult.isErr()) {
              return fsResult;
            }
            return fsResult.value.refreshSandboxMount(sandbox, image);
          }
        );
        if (refreshResult.isErr()) {
          status = "error";
          return refreshResult;
        }
      }

      // Pod state bring-up must run strictly AFTER the mounts (restore reads
      // through the replica mount) and is awaited: `invoke` awaits
      // ensurePodSandboxReady, which is what guarantees no function runs
      // before the restore + daemon start completed. No-op for non-pod owners
      // and for images without the `pod_state` capability.
      if (freshlyCreated && runtimeOwner.kind === "pod") {
        const podStateResult = await setupPodStateOnColdStart(
          auth,
          sandbox,
          image
        );
        if (podStateResult.isErr()) {
          // status=running was already committed by ensureActive, and this
          // block only runs when freshlyCreated — a plain Err would make the
          // NEXT call take the warm path and happily serve a half-initialized
          // sandbox (unrestored databases, no litestream daemon). Request a
          // kill instead: ensureActive's kill-requested branch destroys and
          // recreates on the next access, re-running this setup from scratch.
          logger.error(
            { err: podStateResult.error, sandboxId: sandbox.sId },
            "Pod state cold start failed — requesting sandbox kill so the next access recreates it."
          );
          await sandbox.requestKill();
          status = "error";
          return podStateResult;
        }
      }

      const ensureEgressResult = await traceSandboxStartupPhase(
        "egress_on_exec",
        () =>
          ensureSandboxEgressOnExec(auth, sandbox, {
            runtimeOwner,
            wokeFromSleep,
          })
      );
      if (ensureEgressResult.isErr()) {
        status = "error";
        return ensureEgressResult;
      }

      return new Ok({ sandbox, freshlyCreated });
    });
  } finally {
    recordSandboxStartupTotal(performance.now() - startMs, { cold }, status);
  }
}

export async function ensureConversationSandboxReady(
  auth: Authenticator,
  conversation: ConversationType
): Promise<Result<EnsureSandboxReadyResult, Error>> {
  return ensureOwnerSandboxReady(auth, {
    ensureActive: () =>
      ConversationSandboxAdapter.ensureSandboxActive(auth, conversation),
    getFileSystem: () => DustFileSystem.forConversation(auth, conversation),
    runtimeOwner: {
      kind: "conversation",
      conversationId: conversation.sId,
    },
  });
}

export async function ensurePodSandboxReady(
  auth: Authenticator,
  pod: SpaceResource
): Promise<Result<EnsureSandboxReadyResult, Error>> {
  return ensureOwnerSandboxReady(auth, {
    ensureActive: () => PodSandboxAdapter.ensureSandboxActive(auth, pod),
    getFileSystem: () =>
      DustFileSystem.forPod(auth, pod, {
        sandboxOnlyMounts: podSandboxOnlyMounts(pod),
      }),
    runtimeOwner: {
      kind: "pod",
      spaceId: pod.sId,
    },
  });
}
