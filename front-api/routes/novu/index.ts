import { agentMessageFeedbackWorkflow } from "@app/lib/notifications/workflows/agent-message-feedback";
import { agentSuggestionsReadyWorkflow } from "@app/lib/notifications/workflows/agent-suggestions-ready";
import { balanceThresholdReachedWorkflow } from "@app/lib/notifications/workflows/balance-threshold-reached";
import { conversationUnreadWorkflow } from "@app/lib/notifications/workflows/conversation-unread";
import { podAddedAsMemberWorkflow } from "@app/lib/notifications/workflows/pod-added-as-member";
import { programmaticCapReachedWorkflow } from "@app/lib/notifications/workflows/programmatic-cap-reached";
import { providerCredentialsHealthUpdatedWorkflow } from "@app/lib/notifications/workflows/provider-credential-updated";
import { seatAutoUpgradedWorkflow } from "@app/lib/notifications/workflows/seat-auto-upgraded";
import { skillSuggestionsReadyWorkflow } from "@app/lib/notifications/workflows/skill-suggestions-ready";
import { upgradeRequestCreatedWorkflow } from "@app/lib/notifications/workflows/upgrade-request-created";
import { userAwuCapReachedWorkflow } from "@app/lib/notifications/workflows/user-awu-cap-reached";
import { createHono } from "@front-api/lib/hono";
import { skipRequestLog } from "@front-api/middlewares/request_logger";
import type { ServeHandlerOptions } from "@novu/framework";
import { NovuRequestHandler } from "@novu/framework";

// This endpoint exposes our code-based notification workflows to the Novu
// platform. The Novu platform calls this endpoint to execute workflow steps.
// See: https://docs.novu.co/framework/endpoint

// We build the handler directly on `NovuRequestHandler` (Novu's documented
// "custom serve" pattern) rather than `@novu/framework/next`: the Next adapter
// imports `next/server` at module load, which would pull Next into the
// standalone Hono server and violate [API9]. Novu only touches the standard
// Fetch `Request` surface at runtime, which `ctx.req.raw` already provides.
// https://docs.novu.co/framework/endpoint#writing-a-custom-serve-function

const options: ServeHandlerOptions = {
  workflows: [
    conversationUnreadWorkflow,
    agentMessageFeedbackWorkflow,
    agentSuggestionsReadyWorkflow,
    skillSuggestionsReadyWorkflow,
    podAddedAsMemberWorkflow,
    providerCredentialsHealthUpdatedWorkflow,
    userAwuCapReachedWorkflow,
    balanceThresholdReachedWorkflow,
    programmaticCapReachedWorkflow,
    upgradeRequestCreatedWorkflow,
    seatAutoUpgradedWorkflow,
  ],
};

// `Input` is the single standard Fetch `Request`; `Output` is a standard Fetch
// `Response`. The handler maps that `Request` onto the accessor interface Novu
// expects, and `transformResponse` builds the `Response` Novu hands back.
const handler = new NovuRequestHandler<[Request], Response>({
  frameworkName: "hono",
  ...options,
  handler: (request) => ({
    body: () => request.json(),
    headers: (key) => request.headers.get(key),
    method: () => request.method,
    queryString: (key, url) => url.searchParams.get(key),
    url: () => new URL(request.url),
    transformResponse: ({ body, status, headers }) =>
      new Response(body, { status, headers }),
  }),
}).createHandler();

const app = createHono();

// Novu polls this endpoint frequently; too noisy to log every request.
app.use("*", skipRequestLog);

/** @ignoreswagger */
app.get("/", (ctx) => handler(ctx.req.raw));
app.post("/", (ctx) => handler(ctx.req.raw));
app.options("/", (ctx) => handler(ctx.req.raw));

export default app;
