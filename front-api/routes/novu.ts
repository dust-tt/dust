import { agentMessageFeedbackWorkflow } from "@app/lib/notifications/workflows/agent-message-feedback";
import { agentSuggestionsReadyWorkflow } from "@app/lib/notifications/workflows/agent-suggestions-ready";
import { conversationUnreadWorkflow } from "@app/lib/notifications/workflows/conversation-unread";
import { projectAddedAsMemberWorkflow } from "@app/lib/notifications/workflows/project-added-as-member";
import { providerCredentialsHealthUpdatedWorkflow } from "@app/lib/notifications/workflows/provider-credential-updated";
import { skillSuggestionsReadyWorkflow } from "@app/lib/notifications/workflows/skill-suggestions-ready";
import { serve } from "@novu/framework/next";
import { Hono } from "hono";

// This endpoint exposes our code-based notification workflows to the Novu
// platform. The Novu platform calls this endpoint to execute workflow steps.
// See: https://docs.novu.co/framework/endpoint
//
// We reuse the `@novu/framework/next` adapter because Next 13+ App Router and
// Hono both operate on the Fetch API. The adapter only reads the standard
// `Request` surface (url/method/headers/body) — `c.req.raw` is structurally
// compatible at runtime, but its type is `Request`, not the adapter's
// `NextRequest`, so we cast through the adapter's own parameter type to
// avoid importing from `next/*` in shared code.
const handler = serve({
  workflows: [
    conversationUnreadWorkflow,
    agentMessageFeedbackWorkflow,
    agentSuggestionsReadyWorkflow,
    skillSuggestionsReadyWorkflow,
    projectAddedAsMemberWorkflow,
    providerCredentialsHealthUpdatedWorkflow,
  ],
});

type NovuReq = Parameters<typeof handler.POST>[0];

const app = new Hono();

app.get("/", (ctx) => handler.GET(ctx.req.raw as unknown as NovuReq, ctx));
app.post("/", (ctx) => handler.POST(ctx.req.raw as unknown as NovuReq, ctx));
app.options("/", (ctx) =>
  handler.OPTIONS(ctx.req.raw as unknown as NovuReq, ctx)
);

export default app;
