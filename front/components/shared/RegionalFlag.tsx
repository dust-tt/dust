import type { RegionType } from "@app/types/region";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { FlagSize } from "@dust-tt/sparkle";
import { FlagIcon } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

interface RegionalFlagProps {
  region: RegionType;
  size?: FlagSize;
}

export function RegionalFlag({ region, size = "xs" }: RegionalFlagProps) {
  const { t } = useLingui();

  switch (region) {
    case "europe-west1":
      return (
        <FlagIcon
          code="EU"
          size={size}
          label={t({ message: "EU", context: "European Union" })}
        />
      );
    case "us-central1":
      return null;
    default:
      assertNeverAndIgnore(region);
      return null;
  }
}
