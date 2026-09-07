import { workspaceApp } from "@front-api/middlewares/ctx";
import { withSandboxFunctionInvocationFeature } from "@front-api/middlewares/with_sandbox_functions_feature";

import functionId from "./[functionId]";

const app = workspaceApp();

app.use("*", withSandboxFunctionInvocationFeature());

app.route("/:functionIdOrSlug", functionId);

export default app;
