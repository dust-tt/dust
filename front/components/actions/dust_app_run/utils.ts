import type { SupportedFileContentType } from "@app/types";

export function getDustAppRunResultsFileTitle({
  appName,
  resultsFileContentType,
}: {
  appName: string;
  resultsFileContentType: SupportedFileContentType;
}): string {
  const extension = resultsFileContentType.split("/").pop();
  let title = `${appName}_output`;
  if (extension) {
    title += `.${extension}`;
  }
  return title;
}
