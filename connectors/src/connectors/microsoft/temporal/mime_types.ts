import { getEnabledFeatureFlagsMemoized } from "@connectors/lib/workspace";
import type { ConnectorResource } from "@connectors/resources/connector_resource";

export async function getMimeTypesToSync({
  pdfEnabled,
  connector,
}: {
  pdfEnabled: boolean;
  connector: ConnectorResource;
}) {
  const mimeTypes = [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    // TODO(pr): support those
    // "text/plain",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ];
  if (pdfEnabled) {
    mimeTypes.push("application/pdf");
  }
  const csvEnabled = await isCsvEnabled(connector);
  if (csvEnabled) {
    mimeTypes.push("application/vnd.ms-excel"); // Microsoft type for "text/csv"
  }

  return mimeTypes;
}

async function isCsvEnabled(connector: ConnectorResource): Promise<boolean> {
  const enabledFeatureFlags = await getEnabledFeatureFlagsMemoized(connector);
  return !!enabledFeatureFlags.includes("microsoft_csv_sync");
}
