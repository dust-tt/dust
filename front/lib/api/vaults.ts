import type { DataSourceViewCategory } from "@dust-tt/types";

import type { DataSourceResource } from "@app/lib/resources/data_source_resource";

export const getDataSourceCategory = (
  dataSource: DataSourceResource
): DataSourceViewCategory => {
  if (dataSource.isFolder()) {
    return "folder";
  }

  if (dataSource.isWebcrawler()) {
    return "website";
  }

  return "managed";
};
