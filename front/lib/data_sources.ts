import { CoreAPIDocument } from "@dust-tt/types";

export function getDisplayNameForDocument(document: CoreAPIDocument): string {
  const titleTagPrefix = "title:";
  const titleTag = document.tags.find((tag) => tag.startsWith(titleTagPrefix));
  if (!titleTag) {
    return document.document_id;
  }
  return titleTag.substring(titleTagPrefix.length);
}
