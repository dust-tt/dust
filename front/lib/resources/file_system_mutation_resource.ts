import type { FileSystemScope } from "@app/lib/api/file_system/namespace_scope";
import type { FileSystemOperation } from "@app/lib/api/file_system/namespace_types";
import {
  FILE_SYSTEM_REQUEST_ID_MAX_LENGTH,
  FileSystemOperationError,
} from "@app/lib/api/file_system/namespace_types";
import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { FileSystemNodeResource } from "@app/lib/resources/file_system_node_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { FileSystemMutationModel } from "@app/lib/resources/storage/models/file_system_mutation";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { Attributes, Transaction } from "sequelize";
import { UniqueConstraintError } from "sequelize";
import { z } from "zod";

type CreateRequest = Extract<FileSystemOperation, { operation: "create" }>;

const CreateMutationResponseSchema = z.object({
  nodeId: z.number().int().positive(),
});

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface FileSystemMutationResource
  extends ReadonlyAttributesType<FileSystemMutationModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class FileSystemMutationResource extends BaseResource<FileSystemMutationModel> {
  static model: ModelStaticWorkspaceAware<FileSystemMutationModel> =
    FileSystemMutationModel;

  constructor(
    model: ModelStaticWorkspaceAware<FileSystemMutationModel>,
    blob: Attributes<FileSystemMutationModel>
  ) {
    super(model, blob);
  }

  override delete(): Promise<Result<undefined, Error>> {
    // Receipts are removed by a retention job, never by request handling.
    throw new Error("Filesystem mutation receipts cannot be deleted directly.");
  }

  private static async baseFetch(
    auth: Authenticator,
    requestId: string,
    transaction?: Transaction
  ): Promise<FileSystemMutationResource | null> {
    const row = await this.model.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        requestId,
      },
      transaction,
    });

    return row ? new this(this.model, row.get()) : null;
  }

  private async createdNode(
    auth: Authenticator,
    scope: FileSystemScope,
    transaction?: Transaction
  ): Promise<Result<FileSystemNodeResource, FileSystemOperationError>> {
    if (this.kind !== "create") {
      return new Err(
        new FileSystemOperationError(
          "invalid_operation",
          "That request ID belongs to a different filesystem operation."
        )
      );
    }

    const parsed = CreateMutationResponseSchema.safeParse(this.response);
    if (!parsed.success) {
      return new Err(
        new FileSystemOperationError(
          "invalid_operation",
          "The saved filesystem response is invalid."
        )
      );
    }

    const node = await FileSystemNodeResource.fetchById(
      auth,
      scope,
      parsed.data.nodeId,
      { transaction }
    );
    return node
      ? new Ok(node)
      : new Err(
          new FileSystemOperationError(
            "not_found",
            "The node created by this request is no longer available."
          )
        );
  }

  static async createNode(
    auth: Authenticator,
    scope: FileSystemScope,
    request: CreateRequest
  ): Promise<Result<FileSystemNodeResource, FileSystemOperationError>> {
    if (
      request.requestId.length === 0 ||
      request.requestId.length > FILE_SYSTEM_REQUEST_ID_MAX_LENGTH
    ) {
      return new Err(
        new FileSystemOperationError(
          "invalid_operation",
          `Request ID must be between 1 and ${FILE_SYSTEM_REQUEST_ID_MAX_LENGTH} characters.`
        )
      );
    }

    try {
      return await withTransaction(async (transaction) => {
        // A lost response may cause the daemon to retry the same request. The
        // lock keeps both attempts from creating a node before either receipt exists.
        await this.lockRequest(auth, request.requestId, transaction);

        const existing = await this.baseFetch(
          auth,
          request.requestId,
          transaction
        );
        if (existing) {
          return existing.createdNode(auth, scope, transaction);
        }

        // Locking the parent serializes two different requests for the same
        // name. It also gives createChild the current root after a parent move.
        const parent = await FileSystemNodeResource.fetchById(
          auth,
          scope,
          request.parentId,
          { transaction, forUpdate: true }
        );
        if (!parent) {
          return new Err(
            new FileSystemOperationError(
              "not_found",
              "The parent directory was not found."
            )
          );
        }

        const created = await parent.createChild(
          auth,
          scope,
          request,
          transaction
        );
        if (created.isErr()) {
          return created;
        }

        await this.model.create(
          {
            workspaceId: auth.getNonNullableWorkspace().id,
            completedAt: new Date(),
            requestId: request.requestId,
            kind: "create",
            response: { nodeId: created.value.id },
          },
          { transaction }
        );

        return created;
      });
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        // The unique index is the final guard for both request IDs and names.
        // Re-check the receipt so a retry racing an older server still succeeds.
        return withTransaction(async (transaction) => {
          const existing = await this.baseFetch(
            auth,
            request.requestId,
            transaction
          );
          return existing
            ? existing.createdNode(auth, scope, transaction)
            : new Err(
                new FileSystemOperationError(
                  "already_exists",
                  `${request.name} already exists.`
                )
              );
        });
      }
      throw error;
    }
  }

  private static async lockRequest(
    auth: Authenticator,
    requestId: string,
    transaction: Transaction
  ): Promise<void> {
    const workspaceModelId = auth.getNonNullableWorkspace().id;
    const key = `file_system_create:${workspaceModelId}:${requestId}`;
    // biome-ignore lint/plugin/noRawSql: PostgreSQL advisory locks have no Sequelize equivalent.
    await frontSequelize.query("SELECT pg_advisory_xact_lock(hashtext(:key))", {
      replacements: { key },
      transaction,
    });
  }
}
