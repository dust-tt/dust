import type { FileSystemScope } from "@app/lib/api/file_system/namespace_scope";
import type {
  FileSystemNode,
  FileSystemOperation,
} from "@app/lib/api/file_system/namespace_types";
import { FileSystemOperationError } from "@app/lib/api/file_system/namespace_types";
import type { Authenticator } from "@app/lib/auth";
import { FileSystemNodeModel } from "@app/lib/resources/storage/models/file_system_node";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { WhereOptions } from "sequelize";
import { Op } from "sequelize";

type ReadDirRequest = Extract<FileSystemOperation, { operation: "readDir" }>;

/** All Sequelize access for filesystem nodes lives in this Resource. */
export class FileSystemNodeResource {
  private static render(node: FileSystemNodeModel): FileSystemNode {
    return {
      id: node.id,
      parentId: node.parentId,
      rootKind: node.rootKind,
      rootId: node.rootId,
      name: node.name,
      kind: node.kind,
      mode: node.mode,
      size: Number(node.size),
      contentType: node.contentType,
      blobId: node.blobId,
      contentRevision: node.contentRevision,
      createdAtMs: node.createdAt.getTime(),
      modifiedAtMs: node.updatedAt.getTime(),
    };
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
  ): Promise<FileSystemNode[]> {
    const readableRoots = scope.readableRoots();
    if (readableRoots.length === 0) {
      return [];
    }

    const workspaceId = auth.getNonNullableWorkspace().id;
    await FileSystemNodeModel.bulkCreate(
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

    const rows = await FileSystemNodeModel.findAll({
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
      return this.render(row);
    });
  }

  private static async fetch(
    auth: Authenticator,
    scope: FileSystemScope,
    nodeId: number
  ): Promise<FileSystemNodeModel | null> {
    const allowedWhere = this.allowedWhere(auth, scope);
    if (!allowedWhere) {
      return null;
    }

    return FileSystemNodeModel.findOne({
      where: { ...allowedWhere, id: nodeId },
    });
  }

  static async lookup(
    auth: Authenticator,
    scope: FileSystemScope,
    parentId: number,
    name: string
  ): Promise<Result<FileSystemNode | null, FileSystemOperationError>> {
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
    const node = await FileSystemNodeModel.findOne({
      where: { ...allowedWhere, parentId: parent.id, name },
    });
    return new Ok(node ? this.render(node) : null);
  }

  static async getAttr(
    auth: Authenticator,
    scope: FileSystemScope,
    nodeId: number
  ): Promise<Result<FileSystemNode, FileSystemOperationError>> {
    const node = await this.fetch(auth, scope, nodeId);
    return node
      ? new Ok(this.render(node))
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
      { nodes: FileSystemNode[]; nextAfterName: string | null },
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
    const rows = await FileSystemNodeModel.findAll({
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
      nodes: page.map((row) => this.render(row)),
      nextAfterName:
        rows.length > request.limit ? (page.at(-1)?.name ?? null) : null,
    });
  }
}
