import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { ensureSandboxStateHealthOnSleep } from "@app/lib/api/sandbox/db";
import { getSandboxImage } from "@app/lib/api/sandbox/image";
import type { SandboxRuntimeOwner } from "@app/lib/api/sandbox/owner";
import { podSandboxOnlyMounts } from "@app/lib/api/sandbox/pod_mounts";
import type { Authenticator } from "@app/lib/auth";
import { SandboxEnvVarResource } from "@app/lib/resources/sandbox_env_var_resource";
import type {
  EnsureSandboxResult,
  SandboxCreateBlob,
  SandboxDeleteOwner,
  SandboxLifecycleOwner,
  SandboxPreSleepCheck,
} from "@app/lib/resources/sandbox_resource";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { SandboxOwnerModel } from "@app/lib/resources/storage/models/sandbox";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import assert from "assert";
import type { Transaction } from "sequelize";
import { Op } from "sequelize";

const SANDBOX_OWNER_LOOKUP_CONCURRENCY = 4;

// Pods are project spaces, but SpaceResource cannot import SandboxResource
// without creating an import cycle. Keep this as a thin owner adapter rather
// than a model-backed Resource.
export class PodSandboxAdapter {
  private static assertPod(space: SpaceResource) {
    assert(space.isProject(), "Only pod spaces can own sandboxes.");
  }

  private static async fetchSandboxByPod(
    auth: Authenticator,
    pod: SpaceResource
  ): Promise<SandboxResource | null> {
    this.assertPod(pod);

    const workspaceModelId = auth.getNonNullableWorkspace().id;
    const link = await SandboxOwnerModel.findOne({
      where: {
        spaceId: pod.id,
        workspaceId: workspaceModelId,
      },
    });

    if (!link) {
      return null;
    }

    return SandboxResource.fetchByModelIdForWorkspace(auth, link.sandboxId);
  }

  private static async createSandboxRecordForPod(
    auth: Authenticator,
    pod: SpaceResource,
    blob: SandboxCreateBlob
  ): Promise<SandboxResource> {
    this.assertPod(pod);
    const workspaceModelId = auth.getNonNullableWorkspace().id;

    return withTransaction(async (transaction) => {
      const sandbox = await SandboxResource.makeNew(auth, blob, {
        transaction,
      });

      await SandboxOwnerModel.create(
        {
          workspaceId: workspaceModelId,
          spaceId: pod.id,
          sandboxId: sandbox.id,
        },
        { transaction }
      );

      return sandbox;
    });
  }

  private static toSandboxLifecycleOwner(
    auth: Authenticator,
    pod: SpaceResource
  ): SandboxLifecycleOwner {
    this.assertPod(pod);

    return {
      lockKey: pod.sId,
      fetchSandbox: () => this.fetchSandboxByPod(auth, pod),
    };
  }

  // Sandbox state pre-sleep flush: every committed SQLite transaction must reach
  // the GCS replica before the sandbox may pause or be destroyed. The refresh
  // callback rewrites the root-owned per-mount credentials first — the sync
  // flushes through gcsfuse and the token may have expired while the sandbox sat idle.
  private static podPreSleepCheck(
    auth: Authenticator,
    pod: SpaceResource
  ): SandboxPreSleepCheck {
    return (sandbox) =>
      ensureSandboxStateHealthOnSleep(auth, sandbox, {
        refreshMountCredential: async () => {
          const imageResult = getSandboxImage(auth);
          if (imageResult.isErr()) {
            return imageResult;
          }
          // Provisioning variant: the refresh may run under an invoker authorized
          // only through app sharing, who cannot read the Pod.
          const fsResult = await DustFileSystem.forPodSandboxProvisioning(
            auth,
            pod,
            {
              sandboxOnlyMounts: podSandboxOnlyMounts(pod),
            }
          );
          if (fsResult.isErr()) {
            return fsResult;
          }
          return fsResult.value.refreshSandboxMount(sandbox, imageResult.value);
        },
      });
  }

  private static toSandboxDeleteOwner(
    auth: Authenticator,
    pod: SpaceResource
  ): SandboxDeleteOwner {
    this.assertPod(pod);

    return {
      lockKey: pod.sId,
      fetchSandbox: () => this.fetchSandboxByPod(auth, pod),
      deleteSandbox: async (
        sandbox: SandboxResource,
        transaction: Transaction
      ) => {
        await SandboxOwnerModel.destroy({
          where: {
            spaceId: pod.id,
            sandboxId: sandbox.id,
            workspaceId: auth.getNonNullableWorkspace().id,
          },
          transaction,
        });
      },
    };
  }

  static async fetchSandbox(
    auth: Authenticator,
    pod: SpaceResource
  ): Promise<SandboxResource | null> {
    return this.fetchSandboxByPod(auth, pod);
  }

  static async ensureSandboxActive(
    auth: Authenticator,
    pod: SpaceResource,
    { requireRunning = false }: { requireRunning?: boolean } = {}
  ): Promise<Result<EnsureSandboxResult, Error>> {
    this.assertPod(pod);

    return SandboxResource.ensureActive(
      auth,
      {
        ...this.toSandboxLifecycleOwner(auth, pod),
        // Pods are their own scope and cannot move; nothing to re-resolve
        // under the lock (which also keeps requireRunning's lock-free fast
        // path sound for pods).
        resolveScope: async () => new Ok(undefined),
        // Factory form: the loads only run when a sandbox is actually
        // created — ensureActive on an already-running sandbox discards
        // owner env vars, so eager loads would waste two queries per call.
        envVars: () => this.buildPodEnvVars(auth, pod),
        logLabel: "pod",
        createSandbox: (blob) =>
          this.createSandboxRecordForPod(auth, pod, blob),
      },
      { beforeSleep: this.podPreSleepCheck(auth, pod), requireRunning }
    );
  }

  // Pod env vars ride the owner env layer, which beats the workspace env
  // layer in buildSandboxEnvVars — so a pod var shadows a workspace var of
  // the same name, consistent with the egress-secrets file merge. Config
  // vars are injected in cleartext; HTTPS secrets as their DSEC
  // placeholders (dsbx swaps them on the wire). Fail closed: a var we
  // cannot resolve aborts sandbox creation rather than booting without it.
  private static async buildPodEnvVars(
    auth: Authenticator,
    pod: SpaceResource
  ): Promise<Result<Record<string, string>, Error>> {
    const podScopedResult = await PodSandboxAdapter.buildPodScopedEnvVars(
      auth,
      pod,
      { kind: "pod", spaceId: pod.sId }
    );
    if (podScopedResult.isErr()) {
      return podScopedResult;
    }

    return new Ok({
      ...podScopedResult.value,
      SPACE_ID: pod.sId,
    });
  }

  // Pod config vars (cleartext) + HTTPS secret DSEC placeholders for any
  // sandbox running in the pod — pod-owned or a conversation inside the pod
  // (the runtime owner must be tied to the pod either way).
  static async buildPodScopedEnvVars(
    auth: Authenticator,
    pod: SpaceResource,
    runtimeOwner: SandboxRuntimeOwner
  ): Promise<Result<Record<string, string>, Error>> {
    const podEnvResult = await SandboxEnvVarResource.loadEnv(
      auth,
      { kind: "pod", pod },
      runtimeOwner
    );
    if (podEnvResult.isErr()) {
      return podEnvResult;
    }
    const podPlaceholderEnvResult =
      await SandboxEnvVarResource.loadHttpsSecretPlaceholderEnv(
        auth,
        { kind: "pod", pod },
        runtimeOwner
      );
    if (podPlaceholderEnvResult.isErr()) {
      return podPlaceholderEnvResult;
    }

    return new Ok({
      ...podEnvResult.value,
      ...podPlaceholderEnvResult.value,
    });
  }

  static async pauseSandboxForApproval(
    auth: Authenticator,
    pod: SpaceResource
  ): Promise<Result<void, Error>> {
    this.assertPod(pod);

    return SandboxResource.pauseForApproval(
      auth,
      this.toSandboxLifecycleOwner(auth, pod),
      { beforeSleep: this.podPreSleepCheck(auth, pod) }
    );
  }

  static async deleteSandbox(
    auth: Authenticator,
    pod: SpaceResource
  ): Promise<Result<void, Error>> {
    return SandboxResource.deleteByOwner(
      auth,
      this.toSandboxDeleteOwner(auth, pod)
    );
  }

  static async dangerouslySleepSandboxIfRunning(
    auth: Authenticator,
    pod: SpaceResource
  ): Promise<Result<void, Error>> {
    return SandboxResource.dangerouslySleepIfRunning(
      auth,
      this.toSandboxLifecycleOwner(auth, pod),
      { beforeSleep: this.podPreSleepCheck(auth, pod) }
    );
  }

  static async dangerouslySleepSandboxIfPendingApproval(
    auth: Authenticator,
    pod: SpaceResource
  ): Promise<Result<void, Error>> {
    return SandboxResource.dangerouslySleepIfPendingApproval(
      auth,
      this.toSandboxLifecycleOwner(auth, pod)
    );
  }

  static async dangerouslyDestroySandboxIfSleeping(
    auth: Authenticator,
    pod: SpaceResource
  ): Promise<Result<void, Error>> {
    return SandboxResource.dangerouslyDestroyIfSleeping(
      auth,
      this.toSandboxLifecycleOwner(auth, pod)
    );
  }

  static async dangerouslyDestroySandboxIfKillRequested(
    auth: Authenticator,
    pod: SpaceResource
  ): Promise<Result<void, Error>> {
    return SandboxResource.dangerouslyDestroyIfKillRequested(
      auth,
      this.toSandboxLifecycleOwner(auth, pod),
      { beforeSleep: this.podPreSleepCheck(auth, pod) }
    );
  }

  static async dangerouslyFetchPodModelIdsBySandboxes(
    sandboxes: Pick<SandboxResource, "id" | "workspaceId">[]
  ): Promise<Map<ModelId, ModelId>> {
    if (sandboxes.length === 0) {
      return new Map();
    }

    const sandboxModelIdsByWorkspaceModelId = new Map<ModelId, ModelId[]>();
    for (const sandbox of sandboxes) {
      const sandboxModelIds =
        sandboxModelIdsByWorkspaceModelId.get(sandbox.workspaceId) ?? [];
      sandboxModelIds.push(sandbox.id);
      sandboxModelIdsByWorkspaceModelId.set(
        sandbox.workspaceId,
        sandboxModelIds
      );
    }

    const rows = (
      await concurrentExecutor(
        [...sandboxModelIdsByWorkspaceModelId.entries()],
        async ([workspaceModelId, sandboxModelIds]) =>
          SandboxOwnerModel.findAll({
            where: {
              workspaceId: workspaceModelId,
              spaceId: {
                [Op.ne]: null,
              },
              sandboxId: {
                [Op.in]: sandboxModelIds,
              },
            },
            attributes: ["sandboxId", "spaceId"],
          }),
        { concurrency: SANDBOX_OWNER_LOOKUP_CONCURRENCY }
      )
    ).flat();

    const podModelIdsBySandboxModelId = new Map<ModelId, ModelId>();
    for (const row of rows) {
      if (row.spaceId !== null) {
        podModelIdsBySandboxModelId.set(row.sandboxId, row.spaceId);
      }
    }

    return podModelIdsBySandboxModelId;
  }
}
