import { workspaceApp } from "@front-api/middlewares/ctx";
import { withSandboxFunctionInvocationFeature } from "@front-api/middlewares/with_sandbox_functions_feature";

import functionName from "./[name]";

const app = workspaceApp();

app.use("*", withSandboxFunctionInvocationFeature());

app.route("/:name", functionName);

export default app;
