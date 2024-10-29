import { CompanyIcon, LockIcon, PlanetIcon } from "@dust-tt/sparkle";
import type { SpaceKind } from "@dust-tt/types";
import type React from "react";

export function getSpaceIcon(
  kind: SpaceKind
): (props: React.SVGProps<SVGSVGElement>) => React.ReactElement {
  if (kind === "global") {
    return CompanyIcon;
  }
  if (kind === "public") {
    return PlanetIcon;
  }
  return LockIcon;
}
