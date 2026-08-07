import type { Region } from "@app/lib/model_constructors/types/regions";
import { EUROPE, GLOBAL } from "@app/lib/model_constructors/types/regions";
import type { RegionType } from "@app/types/region";

export const REGION_MAPPING: Record<RegionType, Region> = {
  "europe-west1": EUROPE,
  "us-central1": GLOBAL,
};
