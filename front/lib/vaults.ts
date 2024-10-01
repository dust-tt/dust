import { CompanyIcon, LockIcon, PlanetIcon } from "@dust-tt/sparkle";
import type {
  PlanType,
  VaultKind,
  VaultType,
  WorkspaceType,
} from "@dust-tt/types";
import { groupBy } from "lodash";
import type React from "react";

export const VAULTS_SORT_ORDER: VaultKind[] = [
  "system",
  "global",
  "regular",
  "public",
];

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

export const dustAppsListUrl = (
  owner: WorkspaceType,
  vault: VaultType
): string => {
  return `/w/${owner.sId}/vaults/${vault.sId}/categories/apps`;
};

export const groupVaults = (vaults: VaultType[]) => {
  // Group by kind and sort.
  const groupedVaults = groupBy(vaults, (vault) => vault.kind);
  return VAULTS_SORT_ORDER.map((kind) => ({
    kind,
    vaults: groupedVaults[kind] || [],
  }));
};

export const isPrivateVaultsLimitReached = (
  vaults: VaultType[],
  plan: PlanType
) =>
  plan.limits.vaults.maxVaults !== -1 &&
  vaults.filter((v) => v.kind === "regular" || v.kind === "public").length >=
    plan.limits.vaults.maxVaults;
