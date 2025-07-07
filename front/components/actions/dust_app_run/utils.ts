import type { SupportedFileContentType } from "@app/types";
import { extensionsForContentType } from "@app/types/files";

export function getDustAppRunResultsFileTitle({
  appName,
  resultsFileContentType,
}: {
  appName: string;
  resultsFileContentType: SupportedFileContentType;
}): string {
  const extensions = extensionsForContentType(resultsFileContentType);
  let title = `${appName}_output`;
  if (extensions.length > 0) {
    title += extensions[0];
  }
  return title;
}
