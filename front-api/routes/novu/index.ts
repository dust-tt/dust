import { agentMessageFeedbackWorkflow } from "@app/lib/notifications/workflows/agent-message-feedback";
import { agentSuggestionsReadyWorkflow } from "@app/lib/notifications/workflows/agent-suggestions-ready";
import { conversationUnreadWorkflow } from "@app/lib/notifications/workflows/conversation-unread";
import { projectAddedAsMemberWorkflow } from "@app/lib/notifications/workflows/project-added-as-member";
import { providerCredentialsHealthUpdatedWorkflow } from "@app/lib/notifications/workflows/provider-credential-updated";
import { skillSuggestionsReadyWorkflow } from "@app/lib/notifications/workflows/skill-suggestions-ready";
import { userAwuCapReachedWorkflow } from "@app/lib/notifications/workflows/user-awu-cap-reached";
import { serve } from "@novu/framework/next";
import { Hono } from "hono";

// This endpoint exposes our code-based notification workflows to the Novu
// platform. The Novu platform calls this endpoint to execute workflow steps.
// See: https://docs.novu.co/framework/endpoint

// `@novu/framework/next` types its handlers against `NextRequest`, but at
// runtime they only touch the standard Fetch `Request` surface
// (url/method/headers/body). We can't import `next/*` in `front-api` per
// [API9], and there is no type guard that turns a `Request` into a
// `NextRequest` (the extra fields don't exist at runtime — Novu doesn't read
// them). We re-type the adapter once, at this boundary, against the actual
// runtime contract so the call sites below stay clean.
type FetchHandler = (req: Request, ctx?: unknown) => Promise<Response>;

const novu = serve({
  workflows: [
    conversationUnreadWorkflow,
    agentMessageFeedbackWorkflow,
    agentSuggestionsReadyWorkflow,
    skillSuggestionsReadyWorkflow,
    projectAddedAsMemberWorkflow,
    providerCredentialsHealthUpdatedWorkflow,
    userAwuCapReachedWorkflow,
  ],
}) as unknown as Record<"GET" | "POST" | "OPTIONS", FetchHandler>;

const app = new Hono();

app.get("/", (ctx) => novu.GET(ctx.req.raw, ctx));
app.post("/", (ctx) => novu.POST(ctx.req.raw, ctx));
app.options("/", (ctx) => novu.OPTIONS(ctx.req.raw, ctx));

export default app;
