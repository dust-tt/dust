import { DataSourceType } from "@app/types/data_source";

export function getProviderLogoPathForDataSource(
  ds: DataSourceType
): string | null {
  const provider = ds.connector?.provider;

  if (!provider) {
    return null;
  }

  switch (provider) {
    case "notion":
      return `/static/notion_32x32.png`;

    case "slack":
      return `/static/slack_32x32.png`;

    default:
      ((_provider: never) => {
        // cannot happen
        // this is to make sure we handle all cases
      })(provider);
      return null;
  }
}
