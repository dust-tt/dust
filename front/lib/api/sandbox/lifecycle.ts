import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { setupPodStateOnColdStart } from "@app/lib/api/sandbox/db";
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
import { startTelemetry } from "@app/lib/api/sandbox/telemetry";
import type { Authenticator } from "@app/lib/auth";
import type { ConversationSandboxScope } from "@app/lib/resources/conversation_sandbox_adapter";
import { ConversationSandboxAdapter } from "@app/lib/resources/conversation_sandbox_adapter";
import { PodSandboxAdapter } from "@app/lib/resources/pod_sandbox_adapter";
import type {
  EnsureSandboxResult,
  SandboxResource,
} from "@app/lib/resources/sandbox_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import type { ConversationType } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";

const SANDBOX_RUNTIME_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export interface EnsureSandboxReadyResult {
  sandbox: SandboxResource;
  freshlyCreated: boolean;
}

export type EnsureSandboxReadyWithScopeResult<TScope> =
  EnsureSandboxReadyResult & { scope: TScope };

type SandboxReadyConfig<TScope> = {
  ensureActive: () => Promise<Result<EnsureSandboxResult<TScope>, Error>>;
  // Everything scope-dependent is derived from the scope ensureActive
  // resolved INSIDE the lifecycle lock — never from state the caller read
  // before it. A scope transition (conversation move) holds the same lock,
  // so this config cannot be built from a pod association that a concurrent
  // move already changed.
  deriveConfig: (scope: TScope) => {
    getFileSystem: () => Promise<Result<DustFileSystem, Error>>;
    runtimeOwner: SandboxRuntimeOwner;
    // Which owner policy file (`w/{wId}/sandboxes/{ownerId}.json`) this
    // sandbox's egress is scoped to — the owner's own sId (conversation or
    // pod space).
    egressPolicyOwnerId: string;
    // Inherited pod policy layer for conversation sandboxes running inside a
    // pod; pod-owned sandboxes carry none (their ownerId already is the pod).
    egressPolicyPodId?: string;
  };
};

// /!\ All sandbox-touching tools must use the owner-specific ready helper rather than calling
// the owner adapter directly, otherwise the GCS FUSE mount and egress forwarder bring-up will be
// skipped.
async function ensureOwnerSandboxReady<TScope>(
  auth: Authenticator,
  { ensureActive, deriveConfig }: SandboxReadyConfig<TScope>
): Promise<Result<EnsureSandboxReadyWithScopeResult<TScope>, Error>> {
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

      const { sandbox, freshlyCreated, wokeFromSleep, scope } =
        ensureResult.value;
      cold = freshlyCreated;
      const {
        getFileSystem,
        runtimeOwner,
        egressPolicyOwnerId,
        egressPolicyPodId,
      } = deriveConfig(scope);

      const shouldRefreshRuntime =
        freshlyCreated ||
        wokeFromSleep ||
        !sandbox.lastRuntimeRefreshAt ||
        Date.now() - sandbox.lastRuntimeRefreshAt.getTime() >=
          SANDBOX_RUNTIME_REFRESH_INTERVAL_MS;

      if (freshlyCreated || wokeFromSleep) {
        void startTelemetry(auth, sandbox, runtimeOwner).catch((err) =>
          logger.error({ err }, "Telemetry start failed (fire-and-forget)")
        );
      }

      if (!shouldRefreshRuntime) {
        return new Ok({ sandbox, freshlyCreated, scope });
      }

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

      // Only mount on first creation. e2b preserves the FUSE mount and the
      // root-owned token server across betaPause + connect (verified empirically),
      // so on wake we just need fresh per-mount credentials in /run/dust-gcs.
      if (freshlyCreated) {
        // The image seeds /etc/dust/ca-bundle.pem with system roots, and
        // gcsfuse runs as root to storage.googleapis.com, which the in-sandbox
        // nftables ruleset never touches: every rule is scoped to the
        // non-root Front exec UIDs (1002 and 1003) and the chains default to
        // accept, so root egress is never dropped, even mid-setup. The
        // dev-unrestricted branch tears down the general table but recreates
        // the dedicated GCS broker drops, so it's safe to overlap too.
        // Egress prep can therefore run alongside the GCS mount, with egress
        // errors still taking precedence.
        const [prepResult, mountResult] = await Promise.all([
          traceSandboxStartupPhase("egress_prep", () =>
            prepareSandboxEgressBeforeMount(auth, sandbox, {
              runtimeOwner,
              egressPolicyOwnerId,
              egressPolicyPodId,
            })
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
      // before the restore + daemon start completed. Only runs for pod
      // owners.
      if (freshlyCreated && runtimeOwner.kind === "pod") {
        const podStateResult = await setupPodStateOnColdStart(auth, sandbox);
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
            egressPolicyOwnerId,
            egressPolicyPodId,
            wokeFromSleep,
          })
      );
      if (ensureEgressResult.isErr()) {
        status = "error";
        return ensureEgressResult;
      }

      await sandbox.updateLastRuntimeRefreshAt(new Date());

      return new Ok({ sandbox, freshlyCreated, scope });
    });
  } finally {
    recordSandboxStartupTotal(performance.now() - startMs, { cold }, status);
  }
}

export async function ensureConversationSandboxReady(
  auth: Authenticator,
  conversation: ConversationType
): Promise<Result<EnsureSandboxReadyResult, Error>> {
  return ensureConversationSandboxReadyWithScope(auth, conversation);
}

export async function ensureConversationSandboxReadyWithScope(
  auth: Authenticator,
  conversation: ConversationType
): Promise<
  Result<EnsureSandboxReadyWithScopeResult<ConversationSandboxScope>, Error>
> {
  // Only the conversation's identity is trusted from the caller: it is
  // typically an agent-loop snapshot, and a move — possibly issued by this
  // very agent — can change the pod association mid-loop. The adapter
  // re-resolves spaceId from the database INSIDE the lifecycle lock, and
  // everything scope-dependent below derives from that resolved value.
  return ensureOwnerSandboxReady(auth, {
    ensureActive: () =>
      ConversationSandboxAdapter.ensureSandboxActive(auth, conversation),
    // Pod-level sandbox config applies to everything running in the Pod: a
    // conversation inside a Pod receives the Pod's env vars and HTTPS
    // secrets at creation, and inherits the Pod's egress policy as a
    // read-only layer (egressPolicyPodId). Its own policy file stays
    // conversation-scoped — on-the-fly domain approvals land there, exactly
    // like conversations outside a Pod.
    deriveConfig: (scope) => ({
      getFileSystem: () =>
        DustFileSystem.forConversation(auth, {
          ...conversation,
          spaceId: scope.spaceId,
        }),
      runtimeOwner: {
        kind: "conversation",
        conversationId: conversation.sId,
        spaceId: scope.spaceId,
      },
      egressPolicyOwnerId: conversation.sId,
      egressPolicyPodId: scope.spaceId ?? undefined,
    }),
  });
}

export async function ensurePodSandboxReady(
  auth: Authenticator,
  pod: SpaceResource,
  { requireRunning = false }: { requireRunning?: boolean } = {}
): Promise<Result<EnsureSandboxReadyResult, Error>> {
  return ensureOwnerSandboxReady(auth, {
    ensureActive: () =>
      PodSandboxAdapter.ensureSandboxActive(auth, pod, { requireRunning }),
    // Pods are their own scope and cannot move — the config is static.
    deriveConfig: () => ({
      // Provisioning variant: the boot may be triggered by an invoker authorized
      // only through app sharing, who cannot read the Pod.
      getFileSystem: () =>
        DustFileSystem.forPodSandboxProvisioning(auth, pod, {
          sandboxOnlyMounts: podSandboxOnlyMounts(pod),
        }),
      runtimeOwner: {
        kind: "pod",
        spaceId: pod.sId,
      },
      egressPolicyOwnerId: pod.sId,
    }),
  });
}
