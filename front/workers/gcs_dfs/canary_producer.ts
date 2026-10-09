import { randomUUID } from "node:crypto";

import { Authenticator } from "@app/lib/auth";
import config from "@app/lib/file_storage/config";
import { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import type { CanaryConfig, CanaryProducer } from "@app/workers/gcs_dfs/canary";

export async function frontCanaryProducer(
  binding: CanaryConfig["binding"]
): Promise<CanaryProducer> {
  if (config.getGcsPrivateUploadsBucket() !== binding.bucket) {
    throw new Error("canary_private_bucket_mismatch");
  }
  const auth = await Authenticator.internalAdminForWorkspace(
    binding.workspaceId
  );
  const owner = auth.getNonNullableWorkspace();
  let file: FileResource | undefined;
  return {
    async create(body) {
      if (file) {
        throw new Error("canary_already_created");
      }
      file = await FileResource.makeNew({
        workspaceId: owner.id,
        userId: null,
        fileName: `.dust-gcs-dfs-canary-${randomUUID()}.txt`,
        contentType: "text/plain",
        fileSize: Buffer.byteLength(body),
        useCase: "conversation",
        useCaseMetadata: {},
      });
      const name = file.getCloudStoragePath(auth, "original");
      if (!name.startsWith(binding.prefix)) {
        throw new Error("canary_outside_binding");
      }
      logger.info(
        { workspaceId: owner.sId, fileId: file.sId, objectName: name },
        "GCS DFS canary file allocated"
      );
      await file.uploadContent(auth, body);
      return { bucket: binding.bucket, name };
    },
    async update(body) {
      if (!file) {
        throw new Error("canary_not_created");
      }
      await file.uploadContent(auth, body);
    },
    async remove() {
      if (!file) {
        return;
      }
      if (!file.isReady) {
        await file
          .getBucketForVersion("original")
          .delete(file.getCloudStoragePath(auth, "original"), {
            ignoreNotFound: true,
          });
      }
      const result = await file.delete(auth);
      if (result.isErr()) {
        throw new Error("canary_cleanup_failed");
      }
      file = undefined;
    },
  };
}
