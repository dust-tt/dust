import { CompanyIcon, LockIcon, PlanetIcon } from "@dust-tt/sparkle";
import type { VaultType } from "@dust-tt/types";
import type React from "react";

export function getVaultIcon(
  vault: VaultType
): (props: React.SVGProps<SVGSVGElement>) => React.ReactElement {
  if (vault.kind === "global") {
    return CompanyIcon;
  }
  if (vault.kind === "public") {
    return PlanetIcon;
  }
  return LockIcon;
}

export const getVaultName = (vault: VaultType) => {
  return vault.kind === "global" ? "Company Data" : vault.name;
};

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
