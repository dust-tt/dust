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
} from "@app/lib/resources/sandbox_resource";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { SandboxOwnerModel } from "@app/lib/resources/storage/models/sandbox";
import { makeSId } from "@app/lib/resources/string_ids";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { frameV2ContentType } from "@app/types/files";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import assert from "assert";
import type { Transaction } from "sequelize";
import { Op } from "sequelize";

const SANDBOX_OWNER_LOOKUP_CONCURRENCY = 4;
const SANDBOX_OWNER_DELETE_CONCURRENCY = 4;

export type FrameSandboxOwner = Pick<
  FileResource,
  "id" | "sId" | "workspaceId"
>;

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
    frame: FrameSandboxOwner
  ): Promise<Result<FrameSandboxScope, Error>> {
    this.assertWorkspace(auth, frame);

    const freshFrame = await FileModel.findOne({
      where: {
        contentType: frameV2ContentType,
        id: frame.id,
        workspaceId: frame.workspaceId,
      },
    });
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

  static async fetchSandbox(
    auth: Authenticator,
    frame: FrameSandboxOwner
  ): Promise<SandboxResource | null> {
    return this.fetchSandboxByFrame(auth, frame);
  }

  static async ensureSandboxActive(
    auth: Authenticator,
    frame: FrameSandboxOwner
  ): Promise<Result<EnsureSandboxResult<FrameSandboxScope>, Error>> {
    return SandboxResource.ensureActive(auth, {
      lockKey: this.lockKey(frame),
      resolveScope: () => this.resolveScope(auth, frame),
      envVars: (scope) => this.buildFrameEnvVars(auth, frame, scope),
      logLabel: "frame",
      fetchSandbox: () => this.fetchSandboxByFrame(auth, frame),
      createSandbox: (blob) =>
        this.createSandboxRecordForFrame(auth, frame, blob),
    });
  }

  static async deleteSandbox(
    auth: Authenticator,
    frame: FrameSandboxOwner
  ): Promise<Result<void, Error>> {
    return SandboxResource.deleteByOwner(
      auth,
      this.toSandboxDeleteOwner(auth, frame)
    );
  }

  static async deleteAllForWorkspace(auth: Authenticator): Promise<void> {
    const workspaceModelId = auth.getNonNullableWorkspace().id;
    for (;;) {
      const links = await SandboxOwnerModel.findAll({
        attributes: ["frameFileModelId"],
        where: {
          frameFileModelId: { [Op.ne]: null },
          workspaceId: workspaceModelId,
        },
        limit: 1000,
      });
      if (links.length === 0) {
        return;
      }

      await concurrentExecutor(
        links,
        async (link) => {
          assert(link.frameFileModelId !== null);
          const frame: FrameSandboxOwner = {
            id: link.frameFileModelId,
            sId: makeSId("file", {
              id: link.frameFileModelId,
              workspaceId: workspaceModelId,
            }),
            workspaceId: workspaceModelId,
          };
          const result = await this.deleteSandbox(auth, frame);
          if (result.isErr()) {
            throw result.error;
          }
        },
        { concurrency: SANDBOX_OWNER_DELETE_CONCURRENCY }
      );
    }
  }

  static async dangerouslySleepSandboxIfRunning(
    auth: Authenticator,
    frame: FrameSandboxOwner
  ): Promise<Result<void, Error>> {
    return SandboxResource.dangerouslySleepIfRunning(
      auth,
      this.toSandboxLifecycleOwner(auth, frame)
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
      this.toSandboxLifecycleOwner(auth, frame)
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
