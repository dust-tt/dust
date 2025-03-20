import type { SpaceType } from "@dust-tt/client";
import { LockIcon, PlanetIcon, ServerIcon } from "@dust-tt/sparkle";

export function getSpaceIcon(
  space: SpaceType
): (props: React.SVGProps<SVGSVGElement>) => React.ReactElement {
  if (space.kind === "public") {
    return PlanetIcon;
  }

  if (space.isRestricted) {
    return LockIcon;
  }

  return ServerIcon;
}

export const getSpaceAccessPriority = (space: SpaceType) => {
  if (space.kind === "global") {
    return 2;
  }
  if (!space.isRestricted) {
    return 1;
  }
  return 0;
};
