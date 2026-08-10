import { getPokeCacheCatalog } from "@front-api/lib/api/poke/cache_catalog";
import { pokeApp } from "@front-api/middlewares/ctx";

const app = pokeApp();

/** @ignoreswagger */
app.get("/", (ctx) => {
  return ctx.json({ resources: getPokeCacheCatalog() });
});

export default app;
