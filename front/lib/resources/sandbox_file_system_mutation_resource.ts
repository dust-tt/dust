import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import type { SandboxFileSystemMutationStatus } from "@app/lib/resources/storage/models/sandbox_file_system_mutation";
import { SandboxFileSystemMutationModel } from "@app/lib/resources/storage/models/sandbox_file_system_mutation";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { createHash, randomUUID } from "crypto";
import type { Attributes, Transaction } from "sequelize";
import { Op } from "sequelize";

const CLAIM_TIMEOUT_MS = 30_000;

function hashRequest(request: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(request)).digest("hex");
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface SandboxFileSystemMutationResource
  extends ReadonlyAttributesType<SandboxFileSystemMutationModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SandboxFileSystemMutationResource extends BaseResource<SandboxFileSystemMutationModel> {
  static model: ModelStaticWorkspaceAware<SandboxFileSystemMutationModel> =
    SandboxFileSystemMutationModel;

  constructor(
    _model: ModelStaticWorkspaceAware<SandboxFileSystemMutationModel>,
    blob: Attributes<SandboxFileSystemMutationModel>
  ) {
    super(SandboxFileSystemMutationModel, blob);
  }

  static async claim(
    auth: Authenticator,
    sandbox: SandboxResource,
    {
      idempotencyKey,
      request,
    }: {
      idempotencyKey: string;
      request: Record<string, unknown>;
    }
  ): Promise<
    Result<
      { mutation: SandboxFileSystemMutationResource; shouldExecute: boolean },
      Error
    >
  > {
    const workspaceId = auth.getNonNullableWorkspace().id;
    const requestHash = hashRequest(request);
    const claimedBy = randomUUID();
    const now = new Date();
    const [row] = await this.model.findOrCreate({
      where: {
        workspaceId,
        sandboxId: sandbox.id,
        idempotencyKey,
      },
      defaults: {
        workspaceId,
        sandboxId: sandbox.id,
        idempotencyKey,
        request,
        requestHash,
        status: "pending",
        error: null,
        completedAt: null,
        claimedAt: now,
        claimedBy,
      },
    });

    if (row.requestHash !== requestHash) {
      return new Err(
        new Error("The idempotency key was already used for another mutation.")
      );
    }

    if (row.status === "completed") {
      return new Ok({
        mutation: new this(this.model, row.get()),
        shouldExecute: false,
      });
    }

    const staleBefore = new Date(now.getTime() - CLAIM_TIMEOUT_MS);
    const [claimedCount] = await this.model.update(
      {
        status: "pending",
        error: null,
        claimedAt: now,
        claimedBy,
      },
      {
        where: {
          workspaceId,
          id: row.id,
          requestHash,
          completedAt: null,
          // A failed execution can retry immediately. A pending execution is
          // reclaimed only after its request timeout, avoiding two callers
          // performing the same namespace mutation concurrently.
          [Op.or]: [
            { status: "failed" as SandboxFileSystemMutationStatus },
            { claimedAt: { [Op.lt]: staleBefore } },
            { claimedBy },
          ],
        },
      }
    );

    const mutation = new this(this.model, {
      ...row.get(),
      status: "pending",
      error: null,
      claimedAt: now,
      claimedBy,
    });
    return new Ok({ mutation, shouldExecute: claimedCount === 1 });
  }

  async markCompleted(auth: Authenticator): Promise<void> {
    await this.model.update(
      { status: "completed", error: null, completedAt: new Date() },
      {
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          id: this.id,
          claimedBy: this.claimedBy,
        },
      }
    );
  }

  async markFailed(auth: Authenticator, error: Error): Promise<void> {
    await this.model.update(
      { status: "failed", error: error.message, completedAt: null },
      {
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          id: this.id,
          claimedBy: this.claimedBy,
        },
      }
    );
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    try {
      await this.model.destroy({
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          id: this.id,
        },
        transaction,
      });
      return new Ok(undefined);
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }
}
