import { config as cellsConfig } from "@app/lib/api/cells/config";
import type { GetPokeCellsResponseType } from "@app/types/api/poke/cells";
import { SUPPORTED_CELLS } from "@app/types/cell";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/poke/cells. pokeAuth is applied by the parent poke sub-app.
const app = pokeApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetPokeCellsResponseType> => {
  return ctx.json({
    currentCell: cellsConfig.getCurrentCell(),
    cells: SUPPORTED_CELLS.map((cell) => cellsConfig.getCellInfo(cell)),
  });
});

export default app;
