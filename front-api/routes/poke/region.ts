import { config as cellsConfig } from "@app/lib/api/cells/config";
import { config } from "@app/lib/api/regions/config";
import type { GetRegionResponseType } from "@app/types/api/regions/config";
import { SUPPORTED_CELLS } from "@app/types/cell";
import type { RegionType } from "@app/types/region";
import { SUPPORTED_REGIONS } from "@app/types/region";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/poke/region. pokeAuth is applied by the parent poke sub-app.
const app = pokeApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetRegionResponseType> => {
  const currentRegion = config.getCurrentRegion();
  const currentCell = cellsConfig.getCurrentCell();
  return ctx.json({
    region: currentRegion,
    regionUrls: SUPPORTED_REGIONS.reduce(
      (acc, region) => {
        acc[region] = config.getRegionUrl(region);
        return acc;
      },
      {} as Record<RegionType, string>
    ),
    currentCell,
    cells: SUPPORTED_CELLS.map((cell) => cellsConfig.getCellInfo(cell)),
  });
});

export default app;
