import { unauthedApp } from "@front-api/middlewares/ctx";
import segments from "./[...segments]";
import fileId from "./[fileId]";

// Mounted at /api/v1/viz/files. Single-segment requests (fil_xxx) match the
// [fileId] route; multi-segment scoped paths fall through to [...segments].
const app = unauthedApp();

app.route("/", fileId);
app.route("/", segments);

export default app;
