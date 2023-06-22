import { getDocumentFromDataSource } from "@connectors/lib/data_sources";
import { DataSourceConfig } from "@connectors/types/data_source_config";

export async function documentTrackerActivity(
  dataSourceConfig: DataSourceConfig,
  documentId: string
) {
  const document = await getDocumentFromDataSource(
    dataSourceConfig,
    documentId
  );
  console.log({ document });
}
