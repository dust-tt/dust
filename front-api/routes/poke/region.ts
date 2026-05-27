import { config } from "@app/lib/api/regions/config";
import type { RegionType } from "@app/types/region";
import { SUPPORTED_REGIONS } from "@app/types/region";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

export type GetRegionResponseType = {
  region: RegionType;
  regionUrls: Record<RegionType, string>;
};

// Mounted at /api/poke/region. pokeAuth is applied by the parent poke sub-app.
const app = pokeApp();

app.get("/", async (ctx): HandlerResult<GetRegionResponseType> => {
  const currentRegion = config.getCurrentRegion();
  return ctx.json({
    region: currentRegion,
    regionUrls: SUPPORTED_REGIONS.reduce(
      (acc, region) => {
        acc[region] = config.getRegionUrl(region);
        return acc;
      },
      {} as Record<RegionType, string>
    ),
  });
});

export default app;
