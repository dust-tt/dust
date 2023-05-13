import { CoreAPIDocument } from "@app/lib/core_api";
import { DataSourceType } from "@app/types/data_source";

export function getProviderLogoPathForDataSource(
  ds: DataSourceType
): string | null {
  const provider = ds.connectorProvider;

  if (!provider) {
    return null;
  }

  switch (provider) {
    case "notion":
      return `/static/notion_32x32.png`;

    case "slack":
      return `/static/slack_32x32.png`;

    default:
      return null;
  }
}

export function getDisplayNameForDocument(document: CoreAPIDocument): string {
  const titleTagPrefix = "title:";
  const titleTag = document.tags.find((tag) => tag.startsWith(titleTagPrefix));
  if (!titleTag) {
    return document.document_id;
  }
  return titleTag.substring(titleTagPrefix.length);
}
