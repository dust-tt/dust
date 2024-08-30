import type { DataSourceViewCategory } from "@dust-tt/types";

import { isFolder, isWebsite } from "@app/lib/data_sources";
import type { DataSourceResource } from "@app/lib/resources/data_source_resource";

export const getDataSourceCategory = (
  dataSourceResource: DataSourceResource
): DataSourceViewCategory => {
  if (isFolder(dataSourceResource)) {
    return "folder";
  }

  if (isWebsite(dataSourceResource)) {
    return "website";
  }

  return "managed";
};
