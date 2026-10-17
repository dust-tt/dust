import { unauthedApp } from "@front-api/middlewares/ctx";

import invocations from "./invocations";

const app = unauthedApp();

app.route("/invocations", invocations);

export default app;
