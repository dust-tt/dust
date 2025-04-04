import { contentTypeForExtension } from "@app/types";

export function getMimeTypeFromFile(file: File): string {
  const fileExtension = file.name.split(".").at(-1)?.toLowerCase();

  if (!file.type && fileExtension) {
    // Lookup by extension
    return contentTypeForExtension("." + fileExtension) ?? "";
  }

  return file.type;
}
