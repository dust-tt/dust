import type { FileSystemScope } from "@app/lib/api/file_system/namespace_scope";
import type {
  FileSystemNodeType,
  FileSystemOperation,
} from "@app/lib/api/file_system/namespace_types";
import {
  FILE_SYSTEM_REQUEST_ID_MAX_LENGTH,
  FileSystemNodeSchema,
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
type RenameRequest = Extract<FileSystemOperation, { operation: "rename" }>;

const CreateMutationResponseSchema = z.object({
  nodeId: z.number().int().positive(),
});
const RenameMutationResponseSchema = z.object({
  node: FileSystemNodeSchema,
  sourceParentId: z.number().int().positive(),
  sourceName: z.string(),
  destinationParentId: z.number().int().positive(),
  destinationName: z.string(),
});

const FILE_SYSTEM_NAMESPACE_LOCK_PREFIX = "file_system_namespace";

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

  private static validateRequestId(
    requestId: string
  ): Result<undefined, FileSystemOperationError> {
    if (
      requestId.length === 0 ||
      requestId.length > FILE_SYSTEM_REQUEST_ID_MAX_LENGTH
    ) {
      return new Err(
        new FileSystemOperationError(
          "invalid_operation",
          `Request ID must be between 1 and ${FILE_SYSTEM_REQUEST_ID_MAX_LENGTH} characters.`
        )
      );
    }

    return new Ok(undefined);
  }

  private static async lockNamespace(
    auth: Authenticator,
    {
      mode,
      transaction,
    }: { mode: "exclusive" | "shared"; transaction: Transaction }
  ): Promise<void> {
    const workspaceId = auth.getNonNullableWorkspace().id;
    const key = `${FILE_SYSTEM_NAMESPACE_LOCK_PREFIX}:${workspaceId}`;

    // Creates share this lock and remain concurrent. Rename takes it
    // exclusively because moving a directory across roots rewrites every
    // descendant's cached root fields and must not miss a concurrent child.
    const query =
      mode === "shared"
        ? "SELECT pg_advisory_xact_lock_shared(hashtextextended(:key, 0))"
        : "SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))";
    // biome-ignore lint/plugin/noRawSql: PostgreSQL advisory locks have no Sequelize equivalent.
    await frontSequelize.query(query, {
      replacements: { key },
      transaction,
    });
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

  private async renamedNode(
    scope: FileSystemScope,
    request: RenameRequest
  ): Promise<Result<FileSystemNodeType, FileSystemOperationError>> {
    if (this.kind !== "rename") {
      return new Err(
        new FileSystemOperationError(
          "invalid_operation",
          "That request ID belongs to a different filesystem operation."
        )
      );
    }

    const parsed = RenameMutationResponseSchema.safeParse(this.response);
    if (!parsed.success) {
      return new Err(
        new FileSystemOperationError(
          "invalid_operation",
          "The saved filesystem response is invalid."
        )
      );
    }
    if (
      parsed.data.sourceParentId !== request.sourceParentId ||
      parsed.data.sourceName !== request.sourceName ||
      parsed.data.destinationParentId !== request.destinationParentId ||
      parsed.data.destinationName !== request.destinationName
    ) {
      return new Err(
        new FileSystemOperationError(
          "invalid_operation",
          "That request ID belongs to a different rename."
        )
      );
    }

    if (!scope.canRead(parsed.data.node.rootKind, parsed.data.node.rootId)) {
      return new Err(
        new FileSystemOperationError(
          "not_found",
          "The node renamed by this request is no longer available."
        )
      );
    }

    // Replay the result that committed with the rename. Fetching the node here
    // would return a later move, or nothing if a later rename replaced it.
    return new Ok(parsed.data.node);
  }

  static async createNode(
    auth: Authenticator,
    scope: FileSystemScope,
    request: CreateRequest
  ): Promise<Result<FileSystemNodeResource, FileSystemOperationError>> {
    const requestIdRes = this.validateRequestId(request.requestId);
    if (requestIdRes.isErr()) {
      return requestIdRes;
    }

    try {
      return await withTransaction(async (transaction) => {
        // This must be the first lock in every namespace mutation. Rename must
        // stay disabled until every deployed create path participates.
        await this.lockNamespace(auth, { mode: "shared", transaction });
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

        // Another request can create the receipt while this one waits for the
        // parent lock. Re-check it before creating a second node.
        const concurrent = await this.baseFetch(
          auth,
          request.requestId,
          transaction
        );
        if (concurrent) {
          return concurrent.createdNode(auth, scope, transaction);
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

  static async renameNode(
    auth: Authenticator,
    scope: FileSystemScope,
    request: RenameRequest
  ): Promise<Result<FileSystemNodeType, FileSystemOperationError>> {
    const requestIdRes = this.validateRequestId(request.requestId);
    if (requestIdRes.isErr()) {
      return requestIdRes;
    }

    return withTransaction(async (transaction) => {
      // Take the exclusive namespace lock before any node row lock. This
      // also gives the recursive root update a stable tree to work from.
      await this.lockNamespace(auth, { mode: "exclusive", transaction });

      const existing = await this.baseFetch(
        auth,
        request.requestId,
        transaction
      );
      if (existing) {
        return existing.renamedNode(scope, request);
      }

      const sourceParent = await FileSystemNodeResource.fetchById(
        auth,
        scope,
        request.sourceParentId,
        { transaction, forUpdate: true }
      );
      if (!sourceParent) {
        return new Err(
          new FileSystemOperationError(
            "not_found",
            "The source directory was not found."
          )
        );
      }
      const destinationParent =
        request.destinationParentId === sourceParent.id
          ? sourceParent
          : await FileSystemNodeResource.fetchById(
              auth,
              scope,
              request.destinationParentId,
              { transaction, forUpdate: true }
            );
      if (!destinationParent) {
        return new Err(
          new FileSystemOperationError(
            "not_found",
            "The destination directory was not found."
          )
        );
      }

      // The Node Resource owns the complete rename. This transaction also
      // stores the receipt below, so the two changes commit together.
      const movedRes = await sourceParent.renameChild(auth, scope, {
        sourceName: request.sourceName,
        destinationParent,
        destinationName: request.destinationName,
        transaction,
      });
      if (movedRes.isErr()) {
        return movedRes;
      }
      const node = movedRes.value.toJSON();

      await this.model.create(
        {
          workspaceId: auth.getNonNullableWorkspace().id,
          completedAt: new Date(),
          requestId: request.requestId,
          kind: "rename",
          response: {
            node,
            sourceParentId: request.sourceParentId,
            sourceName: request.sourceName,
            destinationParentId: request.destinationParentId,
            destinationName: request.destinationName,
          },
        },
        { transaction }
      );

      return new Ok(node);
    });
  }
}
