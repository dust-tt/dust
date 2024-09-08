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
