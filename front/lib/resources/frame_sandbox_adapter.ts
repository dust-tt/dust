import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { ensureSandboxStateHealthOnSleep } from "@app/lib/api/sandbox/db";
import { frameSandboxOnlyMounts } from "@app/lib/api/sandbox/frame_mounts";
import { getSandboxImage } from "@app/lib/api/sandbox/image";
import { resolvePodForRuntimeOwner } from "@app/lib/api/sandbox/owner";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { FileResource } from "@app/lib/resources/file_resource";
import { PodSandboxAdapter } from "@app/lib/resources/pod_sandbox_adapter";
import type {
  EnsureSandboxResult,
  SandboxCreateBlob,
  SandboxDeleteOwner,
  SandboxLifecycleOwner,
  SandboxPreSleepCheck,
} from "@app/lib/resources/sandbox_resource";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import type { SandboxStatus } from "@app/lib/resources/storage/models/sandbox";
import { SandboxOwnerModel } from "@app/lib/resources/storage/models/sandbox";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import assert from "assert";
import type { Transaction } from "sequelize";
import { Op } from "sequelize";

const SANDBOX_OWNER_LOOKUP_CONCURRENCY = 4;
const FRAME_SANDBOX_WORKSPACE_DELETE_BATCH_SIZE = 1024;

export type FrameSandboxOwner = Pick<
  FileResource,
  "id" | "sId" | "workspaceId" | "isFrameV2"
>;

type FrameSandboxScopeOwner = FrameSandboxOwner &
  Pick<FileResource, "fetchFreshFrameV2">;

export type FrameSandboxScope = {
  spaceId: string | null;
};

export class FrameGoneError extends Error {}

export class FrameSandboxAdapter {
  private static assertWorkspace(
    auth: Authenticator,
    frame: FrameSandboxOwner
  ): void {
    assert(
      frame.workspaceId === auth.getNonNullableWorkspace().id,
      "The Frame must belong to the authenticated workspace."
    );
  }

  private static lockKey(frame: Pick<FrameSandboxOwner, "sId">): string {
    return frame.sId;
  }

  private static async fetchSandboxByFrame(
    auth: Authenticator,
    frame: FrameSandboxOwner
  ): Promise<SandboxResource | null> {
    this.assertWorkspace(auth, frame);

    const link = await SandboxOwnerModel.findOne({
      where: {
        frameFileModelId: frame.id,
        workspaceId: frame.workspaceId,
      },
    });
    if (!link) {
      return null;
    }

    return SandboxResource.fetchByModelIdForWorkspace(auth, link.sandboxId);
  }

  private static async createSandboxRecordForFrame(
    auth: Authenticator,
    frame: FrameSandboxOwner,
    blob: SandboxCreateBlob
  ): Promise<SandboxResource> {
    this.assertWorkspace(auth, frame);

    return withTransaction(async (transaction) => {
      const sandbox = await SandboxResource.makeNew(auth, blob, {
        transaction,
      });

      await SandboxOwnerModel.create(
        {
          workspaceId: frame.workspaceId,
          frameFileModelId: frame.id,
          sandboxId: sandbox.id,
        },
        { transaction }
      );

      return sandbox;
    });
  }

  private static async resolveScope(
    auth: Authenticator,
    frame: FrameSandboxScopeOwner
  ): Promise<Result<FrameSandboxScope, Error>> {
    this.assertWorkspace(auth, frame);

    const freshFrame = await frame.fetchFreshFrameV2(auth);
    if (!freshFrame) {
      return new Err(new FrameGoneError(`Frame ${frame.sId} not found.`));
    }

    const { conversationId, spaceId } = freshFrame.useCaseMetadata ?? {};
    if (spaceId) {
      return new Ok({ spaceId });
    }
    if (!conversationId) {
      return new Err(
        new Error(`Frame ${frame.sId} has no conversation or Pod scope.`)
      );
    }

    const conversation = await ConversationResource.fetchById(
      auth,
      conversationId,
      { dangerouslySkipPermissionFiltering: true }
    );
    if (!conversation) {
      return new Err(
        new Error(`Frame source conversation ${conversationId} not found.`)
      );
    }

    return new Ok({ spaceId: conversation.spaceSId });
  }

  private static async buildFrameEnvVars(
    auth: Authenticator,
    frame: FrameSandboxOwner,
    scope: FrameSandboxScope
  ): Promise<Result<Record<string, string>, Error>> {
    const baseEnv = { FRAME_ID: frame.sId };
    const runtimeOwner = {
      kind: "frame" as const,
      frameId: frame.sId,
      spaceId: scope.spaceId,
    };
    const podResult = await resolvePodForRuntimeOwner(auth, runtimeOwner);
    if (podResult.isErr()) {
      return podResult;
    }
    if (!podResult.value) {
      return new Ok(baseEnv);
    }

    const podScopedResult = await PodSandboxAdapter.buildPodScopedEnvVars(
      auth,
      podResult.value,
      runtimeOwner
    );
    if (podScopedResult.isErr()) {
      return podScopedResult;
    }

    return new Ok({
      ...podScopedResult.value,
      ...baseEnv,
    });
  }

  private static toSandboxLifecycleOwner(
    auth: Authenticator,
    frame: FrameSandboxOwner
  ): SandboxLifecycleOwner {
    return {
      lockKey: this.lockKey(frame),
      fetchSandbox: () => this.fetchSandboxByFrame(auth, frame),
    };
  }

  private static toSandboxDeleteOwner(
    auth: Authenticator,
    frame: FrameSandboxOwner
  ): SandboxDeleteOwner {
    return {
      ...this.toSandboxLifecycleOwner(auth, frame),
      deleteSandbox: async (
        sandbox: SandboxResource,
        transaction: Transaction
      ) => {
        await SandboxOwnerModel.destroy({
          where: {
            frameFileModelId: frame.id,
            sandboxId: sandbox.id,
            workspaceId: frame.workspaceId,
          },
          transaction,
        });
      },
    };
  }

  private static sqliteStatePreSleepCheck(
    auth: Authenticator,
    frame: FrameSandboxOwner
  ): SandboxPreSleepCheck {
    return (sandbox) =>
      ensureSandboxStateHealthOnSleep(auth, sandbox, {
        refreshMountCredential: async () => {
          const imageResult = getSandboxImage(auth);
          if (imageResult.isErr()) {
            return imageResult;
          }
          const fsResult = await DustFileSystem.forFrameSandboxProvisioning(
            auth,
            frame,
            { sandboxOnlyMounts: frameSandboxOnlyMounts(frame) }
          );
          if (fsResult.isErr()) {
            return fsResult;
          }
          return fsResult.value.refreshSandboxMount(sandbox, imageResult.value);
        },
      });
  }

  static async fetchSandbox(
    auth: Authenticator,
    frame: FrameSandboxOwner
  ): Promise<SandboxResource | null> {
    return this.fetchSandboxByFrame(auth, frame);
  }

  /** One query for the whole page of Frames — the Poke list must not wake or fetch per row. */
  static async fetchSandboxStatusesByFrameModelIds(
    auth: Authenticator,
    frameModelIds: ModelId[]
  ): Promise<Map<ModelId, SandboxStatus>> {
    if (frameModelIds.length === 0) {
      return new Map();
    }

    const links = await SandboxOwnerModel.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        frameFileModelId: { [Op.in]: frameModelIds },
      },
      include: [{ association: "sandbox", required: true }],
    });

    return new Map(
      removeNulls(
        links.map((link) =>
          link.frameFileModelId
            ? ([link.frameFileModelId, link.sandbox.status] as const)
            : null
        )
      )
    );
  }

  static async ensureSandboxActive(
    auth: Authenticator,
    frame: FrameSandboxScopeOwner,
    { requireRunning = false }: { requireRunning?: boolean } = {}
  ): Promise<Result<EnsureSandboxResult<FrameSandboxScope>, Error>> {
    return SandboxResource.ensureActive(
      auth,
      {
        lockKey: this.lockKey(frame),
        resolveScope: () => this.resolveScope(auth, frame),
        envVars: (scope) => this.buildFrameEnvVars(auth, frame, scope),
        logLabel: "frame",
        fetchSandbox: () => this.fetchSandboxByFrame(auth, frame),
        createSandbox: (blob) =>
          this.createSandboxRecordForFrame(auth, frame, blob),
      },
      {
        beforeSleep: this.sqliteStatePreSleepCheck(auth, frame),
        requireRunning,
      }
    );
  }

  static async deleteSandbox(
    auth: Authenticator,
    frame: FrameSandboxOwner,
    {
      afterSandboxCleanup,
    }: {
      afterSandboxCleanup?: () => Promise<Result<undefined, Error>>;
    } = {}
  ): Promise<Result<undefined, Error>> {
    return SandboxResource.deleteByOwner(
      auth,
      this.toSandboxDeleteOwner(auth, frame),
      { afterSandboxCleanup }
    );
  }

  static async deleteAllForWorkspace(auth: Authenticator): Promise<void> {
    const workspaceModelId = auth.getNonNullableWorkspace().id;
    for (;;) {
      const links = await SandboxOwnerModel.findAll({
        attributes: ["sandboxId"],
        where: {
          frameFileModelId: { [Op.ne]: null },
          workspaceId: workspaceModelId,
        },
        limit: FRAME_SANDBOX_WORKSPACE_DELETE_BATCH_SIZE,
      });
      if (links.length === 0) {
        return;
      }

      const sandboxModelIds = links.map((link) => link.sandboxId);
      const sandboxes = await SandboxResource.fetchByModelIdsForWorkspace(
        auth,
        sandboxModelIds
      );
      const result = await SandboxResource.deleteBatchForWorkspaceScrub(auth, {
        sandboxes,
        deleteOwnerLinks: async (transaction) => {
          await SandboxOwnerModel.destroy({
            where: {
              frameFileModelId: { [Op.ne]: null },
              sandboxId: { [Op.in]: sandboxModelIds },
              workspaceId: workspaceModelId,
            },
            transaction,
          });
        },
      });
      if (result.isErr()) {
        throw result.error;
      }
    }
  }

  static async dangerouslySleepSandboxIfRunning(
    auth: Authenticator,
    frame: FrameSandboxOwner
  ): Promise<Result<void, Error>> {
    return SandboxResource.dangerouslySleepIfRunning(
      auth,
      this.toSandboxLifecycleOwner(auth, frame),
      { beforeSleep: this.sqliteStatePreSleepCheck(auth, frame) }
    );
  }

  static async dangerouslySleepSandboxIfPendingApproval(
    auth: Authenticator,
    frame: FrameSandboxOwner
  ): Promise<Result<void, Error>> {
    return SandboxResource.dangerouslySleepIfPendingApproval(
      auth,
      this.toSandboxLifecycleOwner(auth, frame)
    );
  }

  static async dangerouslyDestroySandboxIfSleeping(
    auth: Authenticator,
    frame: FrameSandboxOwner
  ): Promise<Result<void, Error>> {
    return SandboxResource.dangerouslyDestroyIfSleeping(
      auth,
      this.toSandboxLifecycleOwner(auth, frame)
    );
  }

  static async dangerouslyDestroySandboxIfKillRequested(
    auth: Authenticator,
    frame: FrameSandboxOwner
  ): Promise<Result<void, Error>> {
    return SandboxResource.dangerouslyDestroyIfKillRequested(
      auth,
      this.toSandboxLifecycleOwner(auth, frame),
      { beforeSleep: this.sqliteStatePreSleepCheck(auth, frame) }
    );
  }

  static async dangerouslyFetchFrameModelIdsBySandboxes(
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
              frameFileModelId: { [Op.ne]: null },
              sandboxId: { [Op.in]: sandboxModelIds },
            },
            attributes: ["sandboxId", "frameFileModelId"],
          }),
        { concurrency: SANDBOX_OWNER_LOOKUP_CONCURRENCY }
      )
    ).flat();

    const frameModelIdsBySandboxModelId = new Map<ModelId, ModelId>();
    for (const row of rows) {
      if (row.frameFileModelId !== null) {
        frameModelIdsBySandboxModelId.set(row.sandboxId, row.frameFileModelId);
      }
    }
    return frameModelIdsBySandboxModelId;
  }
}
