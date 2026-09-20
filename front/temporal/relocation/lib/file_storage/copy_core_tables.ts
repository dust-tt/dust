const COPY_CONCURRENCY = 5;

interface ObjectMetadata {
  generation?: string | number;
  size?: string | number;
  crc32c?: string;
}

interface TableFile {
  name: string;
  metadata: ObjectMetadata;
}

/**
 * Copy an immutable source snapshot without downloading object contents.
 * Already verified destination objects are checkpoints across activity retries.
 * The caller must keep both source and destination writes frozen until cutover.
 */
export async function copyCoreTableFiles({
  files,
  sourcePrefix,
  destinationPrefix,
  copyFile,
  getDestinationMetadata,
  checkCanContinue,
}: {
  files: TableFile[];
  sourcePrefix: string;
  destinationPrefix: string;
  copyFile: (
    sourceName: string,
    destinationName: string,
    sourceGeneration: string
  ) => Promise<void>;
  getDestinationMetadata: (name: string) => Promise<ObjectMetadata | null>;
  checkCanContinue: () => void;
}): Promise<{ copied: number; alreadyCopied: number }> {
  let copied = 0;
  let alreadyCopied = 0;

  // Use settled batches rather than a fail-fast worker pool: do not return an
  // activity failure while siblings keep launching more writes in the background.
  for (let offset = 0; offset < files.length; offset += COPY_CONCURRENCY) {
    checkCanContinue();
    const results = await Promise.allSettled(
      files.slice(offset, offset + COPY_CONCURRENCY).map(async (file) => {
        checkCanContinue();
        if (!file.name.startsWith(sourcePrefix)) {
          throw new Error(`Object outside relocation prefix: ${file.name}`);
        }
        const { generation, crc32c, size } = file.metadata;
        if (generation === undefined || !crc32c || size === undefined) {
          throw new Error(`Missing source verification metadata: ${file.name}`);
        }
        const destinationName =
          destinationPrefix + file.name.slice(sourcePrefix.length);
        const matches = (metadata: ObjectMetadata | null) =>
          metadata !== null &&
          metadata.size !== undefined &&
          String(metadata.size) === String(size) &&
          metadata.crc32c === crc32c;

        if (matches(await getDestinationMetadata(destinationName))) {
          alreadyCopied++;
          return;
        }

        checkCanContinue();
        await copyFile(file.name, destinationName, String(generation));
        if (!matches(await getDestinationMetadata(destinationName))) {
          throw new Error(
            `Copied table object verification failed: ${destinationName}`
          );
        }
        copied++;
      })
    );

    for (const result of results) {
      if (result.status === "rejected") {
        throw result.reason;
      }
    }
  }

  checkCanContinue();
  return { copied, alreadyCopied };
}
