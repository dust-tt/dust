import type { FileSystemScope } from "@app/lib/api/file_system/namespace_scope";
import type {
  FileSystemNodeType,
  FileSystemOperation,
} from "@app/lib/api/file_system/namespace_types";
import {
  FILE_SYSTEM_MODE_LIMITS,
  FILE_SYSTEM_NAME_MAX_BYTES,
  FILE_SYSTEM_READ_DIR_PAGE_SIZE_LIMITS,
  FileSystemOperationError,
} from "@app/lib/api/file_system/namespace_types";
import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { FileSystemNodeModel } from "@app/lib/resources/storage/models/file_system_node";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { Attributes, Transaction } from "sequelize";
import { Op } from "sequelize";

type ReadDirRequest = Extract<FileSystemOperation, { operation: "readDir" }>;
type ReadDirOptions = Pick<ReadDirRequest, "afterName" | "limit">;
type CreateRequest = Extract<FileSystemOperation, { operation: "create" }>;
type CreateOptions = Pick<CreateRequest, "kind" | "mode" | "name">;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface FileSystemNodeResource
  extends ReadonlyAttributesType<FileSystemNodeModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class FileSystemNodeResource extends BaseResource<FileSystemNodeModel> {
  static model: ModelStaticWorkspaceAware<FileSystemNodeModel> =
    FileSystemNodeModel;

  constructor(
    model: ModelStaticWorkspaceAware<FileSystemNodeModel>,
    blob: Attributes<FileSystemNodeModel>
  ) {
    super(model, blob);
  }

  override delete(): Promise<Result<undefined, Error>> {
    // Removing a node also updates the mutation journal and blob cleanup queue.
    // It must go through the filesystem mutation operation added later.
    throw new Error("Filesystem nodes cannot be deleted directly.");
  }

  private static async baseFetch(
    auth: Authenticator,
    scope: FileSystemScope,
    options: ResourceFindOptions<FileSystemNodeModel> = {},
    {
      transaction,
      forUpdate = false,
    }: { transaction?: Transaction; forUpdate?: boolean } = {}
  ): Promise<FileSystemNodeResource[]> {
    const readableRoots = scope.readableRoots();
    if (readableRoots.length === 0) {
      return [];
    }

    const { where, ...otherOptions } = options;
    const rows = await this.model.findAll({
      ...otherOptions,
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
        [Op.or]: readableRoots.map((root) => ({
          rootKind: root.kind,
          rootId: root.id,
        })),
      },
      transaction,
      ...(transaction && forUpdate ? { lock: transaction.LOCK.UPDATE } : {}),
    });

    return rows.map((row) => new this(this.model, row.get()));
  }

  private static async makeNew(
    parent: FileSystemNodeResource,
    request: CreateOptions,
    transaction: Transaction
  ): Promise<FileSystemNodeResource> {
    const row = await this.model.create(
      {
        workspaceId: parent.workspaceId,
        parentId: parent.id,
        rootKind: parent.rootKind,
        rootId: parent.rootId,
        name: request.name,
        kind: request.kind,
        mode: request.mode,
        size: 0,
        contentType: null,
        blobId: null,
        contentRevision: 0,
      },
      { transaction }
    );

    return new this(this.model, row.get());
  }

  static async ensureRoots(
    auth: Authenticator,
    scope: FileSystemScope
  ): Promise<FileSystemNodeResource[]> {
    const readableRoots = scope.readableRoots();
    if (readableRoots.length === 0) {
      return [];
    }

    const workspaceId = auth.getNonNullableWorkspace().id;
    await this.model.bulkCreate(
      readableRoots.map((root) => ({
        workspaceId,
        parentId: null,
        rootKind: root.kind,
        rootId: root.id,
        name: root.name,
        kind: "directory" as const,
        mode: 0o755,
        size: 0,
        contentType: null,
        blobId: null,
        contentRevision: 0,
      })),
      { ignoreDuplicates: true }
    );

    const roots = await this.baseFetch(auth, scope, {
      where: { parentId: null },
    });
    const rootsByKey = new Map(
      roots.map((root) => [`${root.rootKind}:${root.rootId}`, root])
    );

    return readableRoots.map((allowedRoot) => {
      const root = rootsByKey.get(`${allowedRoot.kind}:${allowedRoot.id}`);
      if (!root) {
        throw new Error(
          `Filesystem root ${allowedRoot.kind}:${allowedRoot.id} is missing.`
        );
      }
      return root;
    });
  }

  static async fetchById(
    auth: Authenticator,
    scope: FileSystemScope,
    nodeId: number,
    options: { transaction?: Transaction; forUpdate?: boolean } = {}
  ): Promise<FileSystemNodeResource | null> {
    const [node] = await this.baseFetch(
      auth,
      scope,
      {
        where: { id: nodeId },
        limit: 1,
      },
      options
    );
    return node ?? null;
  }

  private isReadableBy(auth: Authenticator, scope: FileSystemScope): boolean {
    return (
      this.workspaceId === auth.getNonNullableWorkspace().id &&
      scope.canRead(this.rootKind, this.rootId)
    );
  }

  private isWritableBy(auth: Authenticator, scope: FileSystemScope): boolean {
    return (
      this.workspaceId === auth.getNonNullableWorkspace().id &&
      scope.canWrite(this.rootKind, this.rootId)
    );
  }

  private async fetchChildByName(
    auth: Authenticator,
    scope: FileSystemScope,
    name: string,
    transaction?: Transaction
  ): Promise<FileSystemNodeResource | null> {
    const [child] = await FileSystemNodeResource.baseFetch(
      auth,
      scope,
      {
        where: { parentId: this.id, name },
        limit: 1,
      },
      { transaction }
    );

    return child ?? null;
  }

  async createChild(
    auth: Authenticator,
    scope: FileSystemScope,
    request: CreateOptions,
    transaction: Transaction
  ): Promise<Result<FileSystemNodeResource, FileSystemOperationError>> {
    if (!this.isReadableBy(auth, scope) || this.kind !== "directory") {
      return new Err(
        new FileSystemOperationError(
          "not_found",
          "The parent directory was not found."
        )
      );
    }
    if (!this.isWritableBy(auth, scope)) {
      return new Err(
        new FileSystemOperationError(
          "unauthorized",
          "You do not have write access to this directory."
        )
      );
    }
    if (
      request.name === "." ||
      request.name === ".." ||
      request.name.includes("/") ||
      request.name.includes("\0") ||
      Buffer.byteLength(request.name, "utf8") === 0 ||
      Buffer.byteLength(request.name, "utf8") > FILE_SYSTEM_NAME_MAX_BYTES
    ) {
      return new Err(
        new FileSystemOperationError(
          "invalid_operation",
          `A file name must be between 1 and ${FILE_SYSTEM_NAME_MAX_BYTES} bytes and cannot contain a slash or null byte.`
        )
      );
    }
    if (
      !Number.isInteger(request.mode) ||
      request.mode < FILE_SYSTEM_MODE_LIMITS.min ||
      request.mode > FILE_SYSTEM_MODE_LIMITS.max
    ) {
      return new Err(
        new FileSystemOperationError(
          "invalid_operation",
          `File mode must be between ${FILE_SYSTEM_MODE_LIMITS.min} and ${FILE_SYSTEM_MODE_LIMITS.max}.`
        )
      );
    }

    const existing = await this.fetchChildByName(
      auth,
      scope,
      request.name,
      transaction
    );
    if (existing) {
      return new Err(
        new FileSystemOperationError(
          "already_exists",
          `${request.name} already exists.`
        )
      );
    }

    return new Ok(
      await FileSystemNodeResource.makeNew(this, request, transaction)
    );
  }

  async lookupChild(
    auth: Authenticator,
    scope: FileSystemScope,
    name: string
  ): Promise<Result<FileSystemNodeResource | null, FileSystemOperationError>> {
    if (!this.isReadableBy(auth, scope) || this.kind !== "directory") {
      return new Err(
        new FileSystemOperationError(
          "not_found",
          "The parent directory was not found."
        )
      );
    }

    return new Ok(await this.fetchChildByName(auth, scope, name));
  }

  async readDir(
    auth: Authenticator,
    scope: FileSystemScope,
    options: ReadDirOptions
  ): Promise<
    Result<
      { nodes: FileSystemNodeResource[]; nextAfterName: string | null },
      FileSystemOperationError
    >
  > {
    if (
      !Number.isInteger(options.limit) ||
      options.limit < FILE_SYSTEM_READ_DIR_PAGE_SIZE_LIMITS.min ||
      options.limit > FILE_SYSTEM_READ_DIR_PAGE_SIZE_LIMITS.max
    ) {
      return new Err(
        new FileSystemOperationError(
          "invalid_operation",
          `Directory page size must be between ${FILE_SYSTEM_READ_DIR_PAGE_SIZE_LIMITS.min} and ${FILE_SYSTEM_READ_DIR_PAGE_SIZE_LIMITS.max}.`
        )
      );
    }

    if (!this.isReadableBy(auth, scope) || this.kind !== "directory") {
      return new Err(
        new FileSystemOperationError(
          "not_found",
          "The directory was not found."
        )
      );
    }

    const nodes = await FileSystemNodeResource.baseFetch(auth, scope, {
      where: {
        parentId: this.id,
        ...(options.afterName ? { name: { [Op.gt]: options.afterName } } : {}),
      },
      order: [["name", "ASC"]],
      limit: options.limit + 1,
    });
    const page = nodes.slice(0, options.limit);

    return new Ok({
      nodes: page,
      nextAfterName:
        nodes.length > options.limit ? (page.at(-1)?.name ?? null) : null,
    });
  }

  // Node rendering.

  toJSON(): FileSystemNodeType {
    return {
      id: this.id,
      parentId: this.parentId,
      rootKind: this.rootKind,
      rootId: this.rootId,
      name: this.name,
      kind: this.kind,
      mode: this.mode,
      size: Number(this.size),
      contentType: this.contentType,
      blobId: this.blobId,
      contentRevision: this.contentRevision,
      createdAtMs: this.createdAt.getTime(),
      modifiedAtMs: this.updatedAt.getTime(),
    };
  }
}
