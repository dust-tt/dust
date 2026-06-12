import type { RegionType } from "@app/types/region";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";

const DEFAULT_FLAG_SIZE = 16;

interface RegionalFlagProps {
  region: RegionType;
  size?: number;
}

export function RegionalFlag({
  region,
  size = DEFAULT_FLAG_SIZE,
}: RegionalFlagProps) {
  switch (region) {
    case "europe-west1":
      return (
        <img
          src="/static/EuropeanFlag.svg"
          alt="EU"
          width={size}
          height={size}
        />
      );
    case "us-central1":
      return null;
    default:
      assertNeverAndIgnore(region);
      return null;
  }
}
