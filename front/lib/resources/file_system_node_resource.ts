import type { FileSystemScope } from "@app/lib/api/file_system/namespace_scope";
import type {
  FileSystemNodeType,
  FileSystemOperation,
} from "@app/lib/api/file_system/namespace_types";
import {
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
import type { Attributes } from "sequelize";
import { Op } from "sequelize";

type ReadDirRequest = Extract<FileSystemOperation, { operation: "readDir" }>;
type ReadDirOptions = Pick<ReadDirRequest, "afterName" | "limit">;

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
    options: ResourceFindOptions<FileSystemNodeModel> = {}
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
    });

    return rows.map((row) => new this(this.model, row.get()));
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
    nodeId: number
  ): Promise<FileSystemNodeResource | null> {
    const [node] = await this.baseFetch(auth, scope, {
      where: { id: nodeId },
      limit: 1,
    });
    return node ?? null;
  }

  private isReadableBy(auth: Authenticator, scope: FileSystemScope): boolean {
    return (
      this.workspaceId === auth.getNonNullableWorkspace().id &&
      scope.canRead(this.rootKind, this.rootId)
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

    const [node] = await FileSystemNodeResource.baseFetch(auth, scope, {
      where: { parentId: this.id, name },
      limit: 1,
    });

    return new Ok(node ?? null);
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
