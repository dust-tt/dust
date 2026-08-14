import type { FileSystemScope } from "@app/lib/api/file_system/namespace_scope";
import type {
  FileSystemNode,
  FileSystemOperation,
} from "@app/lib/api/file_system/namespace_types";
import { FileSystemOperationError } from "@app/lib/api/file_system/namespace_types";
import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { FileSystemNodeModel } from "@app/lib/resources/storage/models/file_system_node";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { Attributes, WhereOptions } from "sequelize";
import { Op } from "sequelize";

type ReadDirRequest = Extract<FileSystemOperation, { operation: "readDir" }>;

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

  toJSON(): FileSystemNode {
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

  override delete(): Promise<Result<undefined, Error>> {
    // Removing a node also updates the mutation journal and blob cleanup queue.
    // It must go through the filesystem mutation operation added later.
    throw new Error("Filesystem nodes cannot be deleted directly.");
  }

  private static allowedWhere(
    auth: Authenticator,
    scope: FileSystemScope
  ): WhereOptions<FileSystemNodeModel> | null {
    const readableRoots = scope.readableRoots();
    if (readableRoots.length === 0) {
      return null;
    }

    return {
      workspaceId: auth.getNonNullableWorkspace().id,
      [Op.or]: readableRoots.map((root) => ({
        rootKind: root.kind,
        rootId: root.id,
      })),
    };
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

    const rows = await this.model.findAll({
      where: {
        workspaceId,
        parentId: null,
        [Op.or]: readableRoots.map((root) => ({
          rootKind: root.kind,
          rootId: root.id,
        })),
      },
    });
    const rowsByRoot = new Map(
      rows.map((row) => [`${row.rootKind}:${row.rootId}`, row])
    );

    return readableRoots.map((root) => {
      const row = rowsByRoot.get(`${root.kind}:${root.id}`);
      if (!row) {
        throw new Error(`Filesystem root ${root.kind}:${root.id} is missing.`);
      }
      return new this(this.model, row.get());
    });
  }

  private static async fetch(
    auth: Authenticator,
    scope: FileSystemScope,
    nodeId: number
  ): Promise<FileSystemNodeResource | null> {
    const allowedWhere = this.allowedWhere(auth, scope);
    if (!allowedWhere) {
      return null;
    }

    const row = await this.model.findOne({
      where: { ...allowedWhere, id: nodeId },
    });
    return row ? new this(this.model, row.get()) : null;
  }

  static async lookup(
    auth: Authenticator,
    scope: FileSystemScope,
    parentId: number,
    name: string
  ): Promise<Result<FileSystemNodeResource | null, FileSystemOperationError>> {
    const parent = await this.fetch(auth, scope, parentId);
    if (!parent || parent.kind !== "directory") {
      return new Err(
        new FileSystemOperationError(
          "not_found",
          "The parent directory was not found."
        )
      );
    }

    const allowedWhere = this.allowedWhere(auth, scope);
    if (!allowedWhere) {
      return new Ok(null);
    }
    const node = await this.model.findOne({
      where: { ...allowedWhere, parentId: parent.id, name },
    });
    return new Ok(node ? new this(this.model, node.get()) : null);
  }

  static async getAttr(
    auth: Authenticator,
    scope: FileSystemScope,
    nodeId: number
  ): Promise<Result<FileSystemNodeResource, FileSystemOperationError>> {
    const node = await this.fetch(auth, scope, nodeId);
    return node
      ? new Ok(node)
      : new Err(
          new FileSystemOperationError("not_found", "The inode was not found.")
        );
  }

  static async readDir(
    auth: Authenticator,
    scope: FileSystemScope,
    request: ReadDirRequest
  ): Promise<
    Result<
      { nodes: FileSystemNodeResource[]; nextAfterName: string | null },
      FileSystemOperationError
    >
  > {
    if (
      !Number.isInteger(request.limit) ||
      request.limit < 1 ||
      request.limit > 256
    ) {
      return new Err(
        new FileSystemOperationError(
          "invalid_operation",
          "Directory page size must be between 1 and 256."
        )
      );
    }

    const directory = await this.fetch(auth, scope, request.nodeId);
    if (!directory || directory.kind !== "directory") {
      return new Err(
        new FileSystemOperationError(
          "not_found",
          "The directory was not found."
        )
      );
    }

    const allowedWhere = this.allowedWhere(auth, scope);
    if (!allowedWhere) {
      return new Ok({ nodes: [], nextAfterName: null });
    }
    const rows = await this.model.findAll({
      where: {
        ...allowedWhere,
        parentId: directory.id,
        ...(request.afterName ? { name: { [Op.gt]: request.afterName } } : {}),
      },
      order: [["name", "ASC"]],
      limit: request.limit + 1,
    });
    const page = rows.slice(0, request.limit);

    return new Ok({
      nodes: page.map((row) => new this(this.model, row.get())),
      nextAfterName:
        rows.length > request.limit ? (page.at(-1)?.name ?? null) : null,
    });
  }
}
