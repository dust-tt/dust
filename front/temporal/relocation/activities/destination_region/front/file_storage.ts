import fileStorageConfig from "@app/lib/file_storage/config";

/**
 * Get the destination bucket name for file transfers.
 * Must be async because Temporal requires all activity functions to be async,
 * even if they don't perform async operations internally.
 */
export async function getDestinationPublicBucket() {
  return fileStorageConfig.getGcsPublicUploadBucket();
}

export async function getDestinationPrivateBucket() {
  return fileStorageConfig.getGcsPrivateUploadsBucket();
}

export async function getDestinationTablesBucket() {
  return fileStorageConfig.getDustTablesBucket();
}
