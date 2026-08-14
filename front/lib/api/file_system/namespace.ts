import type { FileSystemScope } from "@app/lib/api/file_system/namespace_scope";
import type {
  FileSystemOperation,
  FileSystemOperationError,
  FileSystemOperationResponse,
} from "@app/lib/api/file_system/namespace_types";
import type { Authenticator } from "@app/lib/auth";
import { FileSystemNodeResource } from "@app/lib/resources/file_system_node_resource";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

export type {
  FileSystemNode,
  FileSystemOperation,
  FileSystemOperationResponse,
} from "./namespace_types";
export { FileSystemOperationError } from "./namespace_types";

/** Run one filesystem read after the caller has selected the allowed roots. */
export async function applyFileSystemOperation(
  auth: Authenticator,
  scope: FileSystemScope,
  request: FileSystemOperation
): Promise<Result<FileSystemOperationResponse, FileSystemOperationError>> {
  switch (request.operation) {
    case "initialize": {
      const roots = await FileSystemNodeResource.ensureRoots(auth, scope);
      return new Ok({ roots });
    }
    case "lookup": {
      const node = await FileSystemNodeResource.lookup(
        auth,
        scope,
        request.parentId,
        request.name
      );
      return node.isErr() ? node : new Ok({ node: node.value });
    }
    case "getAttr": {
      const node = await FileSystemNodeResource.getAttr(
        auth,
        scope,
        request.nodeId
      );
      return node.isErr() ? node : new Ok({ node: node.value });
    }
    case "readDir": {
      const result = await FileSystemNodeResource.readDir(auth, scope, request);
      return result.isErr() ? result : new Ok(result.value);
    }
    default:
      return assertNever(request);
  }
}
