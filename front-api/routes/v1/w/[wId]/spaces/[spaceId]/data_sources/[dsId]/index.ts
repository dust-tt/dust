import { publicApiApp } from "@front-api/middlewares/ctx";

import checkUpsertQueue from "./check_upsert_queue";
import documents from "./documents";
import folders from "./folders";
import search from "./search";
import tables from "./tables";
import tokenize from "./tokenize";

// Mounted at /api/v1/w/:wId/data_sources/:dsId. This directory has no bare
// leaf in Hono yet — only mounts children for the legacy v1 data source
// endpoints.
const app = publicApiApp();

app.route("/check_upsert_queue", checkUpsertQueue);
app.route("/search", search);
app.route("/documents", documents);
app.route("/folders", folders);
app.route("/tables", tables);
app.route("/tokenize", tokenize);

export default app;
