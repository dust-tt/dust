import type { RegionType } from "@app/lib/api/regions/config";
import { assertNever } from "@app/types/shared/utils/assert_never";

export const getRegionDisplay = (region: RegionType): string => {
  switch (region) {
    case "europe-west1":
      return "🇪🇺 EU";
    case "us-central1":
      return "🇺🇸 US";
    default:
      assertNever(region);
  }
};

export const getRegionChipColor = (region: RegionType): "blue" | "green" => {
  switch (region) {
    case "europe-west1":
      return "blue";
    case "us-central1":
      return "green";
    default:
      assertNever(region);
  }
};
