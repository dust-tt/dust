import { unauthedApp } from "@front-api/middlewares/ctx";

import content from "./content";
import files from "./files";

// Mounted at /api/v1/viz. These endpoints authenticate via a viz access token
// carried in the Authorization header, not via publicApiAuth.
const app = unauthedApp();

app.route("/content", content);
app.route("/files", files);

export default app;
