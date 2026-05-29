// biome-ignore-all lint/plugin/noAppImportsInModels: base class needs to reference shared types
import type { Region } from "@app/lib/api/models/types/regions";
import type { Scope } from "@app/lib/api/models/types/scopes";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";

export abstract class DustModel {
  byok: boolean = false;
  scopes: Record<Scope, boolean> = {
    run: true,
    build: true,
  };
  regions: Record<Region, boolean> = {
    global: true,
    europe: false,
    us: false,
  };
  featureflag: WhitelistableFeature | null = null;
}
