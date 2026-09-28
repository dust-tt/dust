import { workspaceApp } from "@front-api/middlewares/ctx";
import { withSandboxFunctionInvocationFeature } from "@front-api/middlewares/with_sandbox_functions_feature";

import invocationId from "./[invocationId]";

const app = workspaceApp();

app.use("*", withSandboxFunctionInvocationFeature());

app.route("/:invocationId", invocationId);

export default app;
