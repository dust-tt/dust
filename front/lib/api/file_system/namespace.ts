import { randomUUID } from "node:crypto";
import type { FileSystemScope } from "@app/lib/api/file_system/namespace_scope";
import type {
  FileSystemOperation,
  FileSystemOperationResponse,
} from "@app/lib/api/file_system/namespace_types";
import { FileSystemOperationError } from "@app/lib/api/file_system/namespace_types";
import type { Authenticator } from "@app/lib/auth";
import { FileSystemContentResource } from "@app/lib/resources/file_system_content_resource";
import { FileSystemMutationResource } from "@app/lib/resources/file_system_mutation_resource";
import { FileSystemNodeResource } from "@app/lib/resources/file_system_node_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

export type {
  FileSystemNode,
  FileSystemOperation,
  FileSystemOperationResponse,
} from "./namespace_types";
export {
  FileSystemOperationError,
  FileSystemOperationSchema,
} from "./namespace_types";

/** Apply one operation after the caller has already selected allowed roots. */
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
    case "create": {
      return FileSystemMutationResource.apply(auth, scope, {
        ...request,
        requestId: request.requestId ?? randomUUID(),
      });
    }
    case "setAttributes": {
      const node = await FileSystemNodeResource.setMode(
        auth,
        scope,
        request.nodeId,
        request.mode
      );
      return node.isErr() ? node : new Ok({ node: node.value });
    }
    case "getContent":
      return FileSystemContentResource.getDownload(auth, scope, request.nodeId);
    case "prepareContentUpload":
      return FileSystemContentResource.prepareUpload(auth, scope, request);
    case "commitContentUpload": {
      const committed = await FileSystemContentResource.commitUpload(
        auth,
        scope,
        request
      );
      if (committed.isErr()) {
        return committed;
      }
      const node = await FileSystemNodeResource.getAttr(
        auth,
        scope,
        committed.value
      );
      return node.isErr() ? node : new Ok({ node: node.value });
    }
    case "remove":
    case "rename":
      return FileSystemMutationResource.apply(auth, scope, request);
    default:
      return new Err(
        new FileSystemOperationError(
          "invalid_operation",
          `Unsupported filesystem operation: ${assertNever(request)}`
        )
      );
  }
}
