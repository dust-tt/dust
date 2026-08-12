import type { FileSystemFileBinding } from "@app/lib/api/file_system/file_binding";
import type { FileSystemScope } from "@app/lib/api/file_system/namespace_scope";
import type {
  FileSystemNode,
  FileSystemOperation,
} from "@app/lib/api/file_system/namespace_types";
import { FileSystemOperationError } from "@app/lib/api/file_system/namespace_types";
import type { Authenticator } from "@app/lib/auth";
import type { FileSystemNodeKind } from "@app/lib/resources/storage/models/file_system_node";
import { FileSystemNodeModel } from "@app/lib/resources/storage/models/file_system_node";
import { makeSId } from "@app/lib/resources/string_ids";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { Transaction, WhereOptions } from "sequelize";
import { Op, UniqueConstraintError } from "sequelize";

type AllowedRoot = FileSystemScope["roots"][number];
type CreateRequest = Extract<FileSystemOperation, { operation: "create" }>;

export class FileSystemNodeResource {
  private static allowedWhere(
    auth: Authenticator,
    roots: readonly AllowedRoot[]
  ): WhereOptions<FileSystemNodeModel> {
    return {
      workspaceId: auth.getNonNullableWorkspace().id,
      [Op.or]: roots.map((root) => ({
        rootKind: root.kind,
        rootId: root.id,
      })),
    };
  }

  static render(
    auth: Authenticator,
    node: FileSystemNodeModel
  ): FileSystemNode {
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
      fileResourceId:
        node.fileId === null
          ? null
          : makeSId("file", {
              id: node.fileId,
              workspaceId: auth.getNonNullableWorkspace().id,
            }),
      createdAtMs: node.createdAt.getTime(),
      modifiedAtMs: node.updatedAt.getTime(),
    };
  }

  static async ensureRoots(
    auth: Authenticator,
    scope: FileSystemScope
  ): Promise<FileSystemNode[]> {
    const roots: FileSystemNode[] = [];
    for (const allowed of scope.roots) {
      const [root] = await FileSystemNodeModel.findOrCreate({
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          parentId: null,
          rootKind: allowed.kind,
          rootId: allowed.id,
        },
        defaults: {
          workspaceId: auth.getNonNullableWorkspace().id,
          parentId: null,
          rootKind: allowed.kind,
          rootId: allowed.id,
          name: allowed.name,
          kind: "directory",
          mode: 0o755,
          size: 0,
          contentType: null,
          blobId: null,
          contentRevision: 0,
          fileId: null,
          pendingMutationId: null,
        },
      });
      roots.push(this.render(auth, root));
    }
    return roots;
  }

  static async fetch(
    auth: Authenticator,
    scope: FileSystemScope,
    nodeId: number,
    transaction?: Transaction
  ): Promise<FileSystemNodeModel | null> {
    return FileSystemNodeModel.findOne({
      where: { ...this.allowedWhere(auth, scope.roots), id: nodeId },
      transaction,
      ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
    });
  }

  private static async writableParent(
    auth: Authenticator,
    scope: FileSystemScope,
    parentId: number,
    transaction?: Transaction
  ): Promise<Result<FileSystemNodeModel, FileSystemOperationError>> {
    const parent = await this.fetch(auth, scope, parentId, transaction);
    if (!parent || parent.kind !== "directory") {
      return new Err(
        new FileSystemOperationError(
          "not_found",
          "The parent directory was not found."
        )
      );
    }
    if (!scope.canWrite(parent.rootKind, parent.rootId)) {
      return new Err(
        new FileSystemOperationError(
          "unauthorized",
          "You do not have write access to this directory."
        )
      );
    }
    return new Ok(parent);
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
    const node = await FileSystemNodeModel.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        parentId: parent.id,
        name,
      },
    });
    return new Ok(node ? this.render(auth, node) : null);
  }

  static async getAttr(
    auth: Authenticator,
    scope: FileSystemScope,
    nodeId: number
  ): Promise<Result<FileSystemNode, FileSystemOperationError>> {
    const node = await this.fetch(auth, scope, nodeId);
    return node
      ? new Ok(this.render(auth, node))
      : new Err(
          new FileSystemOperationError("not_found", "The inode was not found.")
        );
  }

  static async readDir(
    auth: Authenticator,
    scope: FileSystemScope,
    request: { nodeId: number; afterName: string | null; limit: number }
  ): Promise<
    Result<
      { nodes: FileSystemNode[]; nextAfterName: string | null },
      FileSystemOperationError
    >
  > {
    const directory = await this.fetch(auth, scope, request.nodeId);
    if (!directory || directory.kind !== "directory") {
      return new Err(
        new FileSystemOperationError(
          "not_found",
          "The directory was not found."
        )
      );
    }
    const rows = await FileSystemNodeModel.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        parentId: directory.id,
        ...(request.afterName ? { name: { [Op.gt]: request.afterName } } : {}),
      },
      order: [
        ["name", "ASC"],
        ["id", "ASC"],
      ],
      limit: request.limit + 1,
    });
    const hasMore = rows.length > request.limit;
    const page = rows.slice(0, request.limit);
    return new Ok({
      nodes: page.map((row) => this.render(auth, row)),
      nextAfterName: hasMore ? (page.at(-1)?.name ?? null) : null,
    });
  }

  static async create(
    auth: Authenticator,
    scope: FileSystemScope,
    request: CreateRequest
  ): Promise<Result<FileSystemNode, FileSystemOperationError>> {
    try {
      return await withTransaction(async (transaction) => {
        const parent = await this.writableParent(
          auth,
          scope,
          request.parentId,
          transaction
        );
        if (parent.isErr()) {
          return parent;
        }
        const node = await FileSystemNodeModel.create(
          {
            workspaceId: parent.value.workspaceId,
            parentId: parent.value.id,
            rootKind: parent.value.rootKind,
            rootId: parent.value.rootId,
            name: request.name,
            kind: request.kind,
            mode: request.mode,
            size: 0,
            contentType: null,
            blobId: null,
            contentRevision: 0,
            fileId: null,
            pendingMutationId: null,
          },
          { transaction }
        );
        return new Ok(this.render(auth, node));
      });
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        return new Err(
          new FileSystemOperationError(
            "already_exists",
            `${request.name} already exists.`
          )
        );
      }
      throw error;
    }
  }

  static async setMode(
    auth: Authenticator,
    scope: FileSystemScope,
    nodeId: number,
    mode: number
  ): Promise<Result<FileSystemNode, FileSystemOperationError>> {
    const node = await this.fetch(auth, scope, nodeId);
    if (!node) {
      return new Err(
        new FileSystemOperationError("not_found", "The inode was not found.")
      );
    }
    if (!scope.canWrite(node.rootKind, node.rootId)) {
      return new Err(
        new FileSystemOperationError(
          "unauthorized",
          "You do not have write access to this inode."
        )
      );
    }
    await node.update({ mode });
    return new Ok(this.render(auth, node));
  }

  static async attachFileResource(
    auth: Authenticator,
    scope: FileSystemScope,
    binding: FileSystemFileBinding,
    nodeId: number,
    fileResourceId: string
  ): Promise<Result<FileSystemNode, FileSystemOperationError>> {
    const fileModelId = await binding.resolveFileModelId(auth, fileResourceId);
    if (fileModelId === null) {
      return new Err(
        new FileSystemOperationError(
          "not_found",
          "The FileResource was not found."
        )
      );
    }
    try {
      return await withTransaction(async (transaction) => {
        const node = await this.fetch(auth, scope, nodeId, transaction);
        if (!node || node.kind !== "file") {
          return new Err(
            new FileSystemOperationError(
              "not_found",
              "The file inode was not found."
            )
          );
        }
        if (!scope.canWrite(node.rootKind, node.rootId)) {
          return new Err(
            new FileSystemOperationError(
              "unauthorized",
              "You do not have write access to this file."
            )
          );
        }
        const existing = await FileSystemNodeModel.findOne({
          where: {
            workspaceId: node.workspaceId,
            fileId: fileModelId,
            id: { [Op.ne]: node.id },
          },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (existing) {
          return new Err(
            new FileSystemOperationError(
              "already_exists",
              "That FileResource is already attached to another inode."
            )
          );
        }
        await node.update({ fileId: fileModelId }, { transaction });
        return new Ok(this.render(auth, node));
      });
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        return new Err(
          new FileSystemOperationError(
            "already_exists",
            "That FileResource is already attached to another inode."
          )
        );
      }
      throw error;
    }
  }

  static async relativePath(
    auth: Authenticator,
    scope: FileSystemScope,
    node: FileSystemNodeModel,
    transaction?: Transaction
  ): Promise<string> {
    const names: string[] = [];
    let current = node;
    for (let depth = 0; depth < 256; depth += 1) {
      if (current.parentId === null) {
        return names.reverse().join("/");
      }
      names.push(current.name);
      const parent = await this.fetch(
        auth,
        scope,
        current.parentId,
        transaction
      );
      if (!parent) {
        throw new FileSystemOperationError(
          "not_found",
          "An inode parent disappeared."
        );
      }
      current = parent;
    }
    throw new FileSystemOperationError(
      "invalid_operation",
      "The filesystem path is too deep."
    );
  }

  static async isEmptyDirectory(
    auth: Authenticator,
    node: FileSystemNodeModel,
    transaction: Transaction
  ): Promise<boolean> {
    if (node.kind !== "directory") {
      return true;
    }
    return (
      (await FileSystemNodeModel.findOne({
        attributes: ["id"],
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          parentId: node.id,
        },
        transaction,
        lock: transaction.LOCK.KEY_SHARE,
      })) === null
    );
  }

  static defaultContentType(kind: FileSystemNodeKind): string | null {
    return kind === "file" ? "application/octet-stream" : null;
  }
}
