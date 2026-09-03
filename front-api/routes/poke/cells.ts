import { config as cellsConfig } from "@app/lib/api/cells/config";
import type { GetPokeCellsResponseType } from "@app/types/api/poke/cells";
import { SUPPORTED_CELLS } from "@app/types/cell";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/poke/cells. pokeAuth is applied by the parent poke sub-app.
const app = pokeApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetPokeCellsResponseType> => {
  const currentCell = cellsConfig.getCurrentCell();
  return ctx.json({
    currentCell: {
      ...currentCell,
      url: cellsConfig.getCellUrl(currentCell.name),
    },
    cells: SUPPORTED_CELLS.map((cell) => ({
      ...cellsConfig.getCellInfo(cell),
      url: cellsConfig.getCellUrl(cell),
    })),
  });
});

export default app;
