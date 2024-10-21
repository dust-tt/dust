import { LockIcon, PlanetIcon, ServerIcon } from "@dust-tt/sparkle";
import type { PlanType, VaultType, WorkspaceType } from "@dust-tt/types";
import { groupBy } from "lodash";
import type React from "react";

const VAULT_SECTION_GROUP_ORDER = [
  "system",
  "shared",
  "restricted",
  "public",
] as const;

export type VaultSectionGroupType = (typeof VAULT_SECTION_GROUP_ORDER)[number];

export function getVaultIcon(
  vault: VaultType
): (props: React.SVGProps<SVGSVGElement>) => React.ReactElement {
  if (vault.kind === "public") {
    return PlanetIcon;
  }

  if (vault.isRestricted) {
    return LockIcon;
  }

  return ServerIcon;
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
  const groupedVaults = groupBy(vaults, (vault): VaultSectionGroupType => {
    switch (vault.kind) {
      case "public":
      case "system":
        return vault.kind;

      case "global":
      case "regular":
        return vault.isRestricted ? "restricted" : "shared";
    }
  });

  return VAULT_SECTION_GROUP_ORDER.map((section) => ({
    section,
    vaults: groupedVaults[section] || [],
  }));
};

export const isPrivateVaultsLimitReached = (
  vaults: VaultType[],
  plan: PlanType
) =>
  plan.limits.vaults.maxVaults !== -1 &&
  vaults.filter((v) => v.kind === "regular" || v.kind === "public").length >=
    plan.limits.vaults.maxVaults;
