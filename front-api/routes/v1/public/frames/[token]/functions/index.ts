import { unauthedApp } from "@front-api/middlewares/ctx";

import functionName from "./[name]";

const app = unauthedApp();

app.route("/:name", functionName);

export default app;
