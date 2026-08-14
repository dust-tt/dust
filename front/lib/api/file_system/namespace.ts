import type { FileSystemScope } from "@app/lib/api/file_system/namespace_scope";
import type {
  FileSystemOperation,
  FileSystemOperationResponse,
} from "@app/lib/api/file_system/namespace_types";
import { FileSystemOperationError } from "@app/lib/api/file_system/namespace_types";
import type { Authenticator } from "@app/lib/auth";
import { FileSystemMutationResource } from "@app/lib/resources/file_system_mutation_resource";
import { FileSystemNodeResource } from "@app/lib/resources/file_system_node_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

export type {
  FileSystemNodeType,
  FileSystemOperation,
  FileSystemOperationResponse,
} from "./namespace_types";
export {
  FileSystemOperationError,
  FileSystemOperationResponseSchema,
  FileSystemOperationSchema,
} from "./namespace_types";

/** Run one filesystem read after the caller has selected the allowed roots. */
export async function applyFileSystemOperation(
  auth: Authenticator,
  scope: FileSystemScope,
  request: FileSystemOperation
): Promise<Result<FileSystemOperationResponse, FileSystemOperationError>> {
  switch (request.operation) {
    case "initialize": {
      const roots = await FileSystemNodeResource.ensureRoots(auth, scope);

      return new Ok({ roots: roots.map((root) => root.toJSON()) });
    }

    case "lookup": {
      const parent = await FileSystemNodeResource.fetchById(
        auth,
        scope,
        request.parentId
      );
      if (!parent) {
        return new Err(
          new FileSystemOperationError(
            "not_found",
            "The parent directory was not found."
          )
        );
      }

      const node = await parent.lookupChild(auth, scope, request.name);

      return node.isErr()
        ? node
        : new Ok({ node: node.value?.toJSON() ?? null });
    }

    case "getAttr": {
      const node = await FileSystemNodeResource.fetchById(
        auth,
        scope,
        request.nodeId
      );
      if (!node) {
        return new Err(
          new FileSystemOperationError("not_found", "The inode was not found.")
        );
      }

      return new Ok({ node: node.toJSON() });
    }

    case "readDir": {
      const directory = await FileSystemNodeResource.fetchById(
        auth,
        scope,
        request.nodeId
      );
      if (!directory) {
        return new Err(
          new FileSystemOperationError(
            "not_found",
            "The directory was not found."
          )
        );
      }

      const result = await directory.readDir(auth, scope, {
        afterName: request.afterName,
        limit: request.limit,
      });

      return result.isErr()
        ? result
        : new Ok({
            nodes: result.value.nodes.map((node) => node.toJSON()),
            nextAfterName: result.value.nextAfterName,
          });
    }

    case "create": {
      const node = await FileSystemMutationResource.createNode(
        auth,
        scope,
        request
      );

      return node.isErr() ? node : new Ok({ node: node.value.toJSON() });
    }

    case "remove": {
      const removedRes = await FileSystemMutationResource.removeNode(
        auth,
        scope,
        request
      );

      return removedRes.isErr() ? removedRes : new Ok({});
    }

    case "rename": {
      const nodeRes = await FileSystemMutationResource.renameNode(
        auth,
        scope,
        request
      );

      return nodeRes.isErr() ? nodeRes : new Ok({ node: nodeRes.value });
    }

    case "getContent": {
      const node = await FileSystemNodeResource.fetchById(
        auth,
        scope,
        request.nodeId
      );
      if (!node) {
        return new Err(
          new FileSystemOperationError("not_found", "The file was not found.")
        );
      }

      const contentRes = await node.getContent(auth, scope);
      return contentRes.isErr()
        ? contentRes
        : new Ok({ content: contentRes.value });
    }

    case "prepareContentUpload": {
      const node = await FileSystemNodeResource.fetchById(
        auth,
        scope,
        request.nodeId
      );
      if (!node) {
        return new Err(
          new FileSystemOperationError("not_found", "The file was not found.")
        );
      }

      const uploadRes = await node.prepareContentUpload(auth, scope, {
        expectedBlobId: request.expectedBlobId,
        expectedSizeBytes: request.expectedSizeBytes,
        contentType: request.contentType,
      });
      return uploadRes.isErr()
        ? uploadRes
        : new Ok({ upload: uploadRes.value });
    }

    case "commitContentUpload": {
      const node = await FileSystemNodeResource.fetchById(
        auth,
        scope,
        request.nodeId
      );
      if (!node) {
        return new Err(
          new FileSystemOperationError("not_found", "The file was not found.")
        );
      }

      const committedRes = await node.commitContentUpload(auth, scope, {
        expectedBlobId: request.expectedBlobId,
        blobId: request.blobId,
        expectedSizeBytes: request.expectedSizeBytes,
        contentType: request.contentType,
      });
      return committedRes.isErr()
        ? committedRes
        : new Ok({ node: committedRes.value.toJSON() });
    }

    case "setExecutableBits": {
      const node = await FileSystemNodeResource.fetchById(
        auth,
        scope,
        request.nodeId
      );
      if (!node) {
        return new Err(
          new FileSystemOperationError("not_found", "The inode was not found.")
        );
      }

      const updatedNodeRes = await node.setExecutableBits(auth, scope, {
        executableBits: request.executableBits,
      });

      return updatedNodeRes.isErr()
        ? updatedNodeRes
        : new Ok({ node: updatedNodeRes.value.toJSON() });
    }

    default:
      return assertNever(request);
  }
}
