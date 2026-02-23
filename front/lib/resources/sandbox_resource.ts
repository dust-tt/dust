import { getSandboxProvider } from "@app/lib/api/sandbox";
import type { ExecOptions, ExecResult } from "@app/lib/api/sandbox/provider";
import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { SandboxStatus } from "@app/lib/resources/storage/models/sandbox";
import { SandboxModel } from "@app/lib/resources/storage/models/sandbox";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import logger from "@app/logger/logger";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import assert from "assert";
import type { Attributes, ModelStatic, Transaction } from "sequelize";

interface EnsureSandboxResult {
  sandbox: SandboxResource;
  freshlyCreated: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface SandboxResource extends ReadonlyAttributesType<SandboxModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SandboxResource extends BaseResource<SandboxModel> {
  static model: ModelStaticWorkspaceAware<SandboxModel> = SandboxModel;

  constructor(
    _model: ModelStatic<SandboxModel>,
    blob: Attributes<SandboxModel>
  ) {
    super(SandboxModel, blob);
  }

  get sId(): string {
    return SandboxResource.modelIdToSId({
      id: this.id,
      workspaceId: this.workspaceId,
    });
  }

  static modelIdToSId({
    id,
    workspaceId,
  }: {
    id: ModelId;
    workspaceId: ModelId;
  }): string {
    return makeSId("sandbox", { id, workspaceId });
  }

  static async makeNew(
    auth: Authenticator,
    blob: {
      conversationId: number;
      providerId: string;
      status: SandboxStatus;
    },
    { transaction }: { transaction?: Transaction } = {}
  ) {
    const sandbox = await this.model.create(
      {
        ...blob,
        workspaceId: auth.getNonNullableWorkspace().id,
        lastActivityAt: new Date(),
      },
      { transaction }
    );

    return new this(this.model, sandbox.get());
  }

  private static async baseFetch(
    auth: Authenticator,
    options?: ResourceFindOptions<SandboxModel>
  ) {
    const { where, ...rest } = options ?? {};
    const rows = await this.model.findAll({
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      ...rest,
    });

    return rows.map((r) => new this(this.model, r.get()));
  }

  static async fetchByConversationId(
    auth: Authenticator,
    conversationId: number
  ): Promise<SandboxResource | null> {
    const [row] = await this.baseFetch(auth, {
      where: { conversationId },
    });

    return row ?? null;
  }

  async updateStatus(
    status: SandboxStatus,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<[affectedCount: number]> {
    return this.update({ status }, transaction);
  }

  async updateLastActivityAt({
    transaction,
  }: {
    transaction?: Transaction;
  } = {}): Promise<[affectedCount: number]> {
    return this.update({ lastActivityAt: new Date() }, transaction);
  }

  async updateForRecreation(
    providerId: string,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<[affectedCount: number]> {
    return this.update(
      {
        providerId,
        status: "running",
        lastActivityAt: new Date(),
      },
      transaction
    );
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<number, Error>> {
    const deletedCount = await SandboxModel.destroy({
      where: {
        id: this.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
    });

    return new Ok(deletedCount);
  }

  // ---------------------------------------------------------------------------
  // Provider-facing operations
  // ---------------------------------------------------------------------------

  /**
   * Ensure a running sandbox exists for the given conversation.
   *
   * The provider is resolved internally — callers never touch it.
   */
  static async ensureActive(
    auth: Authenticator,
    conversationId: ModelId
  ): Promise<Result<EnsureSandboxResult, Error>> {
    const provider = getSandboxProvider();
    if (!provider) {
      return new Err(new Error("Sandbox provider not configured."));
    }

    const existing = await SandboxResource.fetchByConversationId(
      auth,
      conversationId
    );

    if (!existing) {
      try {
        const handle = await provider.create({});
        const sandbox = await SandboxResource.makeNew(auth, {
          conversationId,
          providerId: handle.providerId,
          status: "running",
        });

        logger.info(
          { sandbox: sandbox.toLogJSON() },
          "Created new sandbox for conversation"
        );

        return new Ok({ sandbox, freshlyCreated: true });
      } catch (err) {
        return new Err(normalizeError(err));
      }
    }

    const { status } = existing;

    switch (status) {
      case "running": {
        await existing.updateLastActivityAt();

        return new Ok({ sandbox: existing, freshlyCreated: false });
      }

      case "sleeping": {
        try {
          await provider.wake(existing.providerId);
          await existing.updateStatus("running");
          await existing.updateLastActivityAt();

          logger.info(
            { sandbox: existing.toLogJSON() },
            "Woke sleeping sandbox"
          );

          return new Ok({ sandbox: existing, freshlyCreated: false });
        } catch (err) {
          return new Err(normalizeError(err));
        }
      }

      case "deleted": {
        try {
          const handle = await provider.create({});
          await existing.updateForRecreation(handle.providerId);

          logger.info(
            {
              sandbox: existing.toLogJSON(),
              newProviderId: handle.providerId,
            },
            "Recreated sandbox from deleted state"
          );

          return new Ok({ sandbox: existing, freshlyCreated: true });
        } catch (err) {
          return new Err(normalizeError(err));
        }
      }

      default:
        assertNever(status);
    }
  }

  /**
   * Execute a command in this sandbox.
   *
   * Asserts workspace ownership to prevent cross-workspace usage.
   */
  async exec(
    auth: Authenticator,
    command: string,
    opts?: ExecOptions
  ): Promise<Result<ExecResult, Error>> {
    assert(
      auth.getNonNullableWorkspace().id === this.workspaceId,
      "Cannot exec on a sandbox belonging to a different workspace"
    );

    const provider = getSandboxProvider();
    if (!provider) {
      return new Err(new Error("Sandbox provider not configured."));
    }

    try {
      const result = await provider.exec(this.providerId, command, opts);

      return new Ok(result);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  toLogJSON() {
    return {
      id: this.sId,
      workspaceId: this.workspaceId,
      conversationId: this.conversationId,
      providerId: this.providerId,
      status: this.status,
      lastActivityAt: this.lastActivityAt.toISOString(),
    };
  }
}
