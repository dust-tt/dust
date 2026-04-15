/** @ignoreswagger */
import { agentMessageFeedbackWorkflow } from "@app/lib/notifications/workflows/agent-message-feedback";
import { agentSuggestionsReadyWorkflow } from "@app/lib/notifications/workflows/agent-suggestions-ready";
import { conversationUnreadWorkflow } from "@app/lib/notifications/workflows/conversation-unread";
import { projectAddedAsMemberWorkflow } from "@app/lib/notifications/workflows/project-added-as-member";
import { providerCredentialsHealthUpdatedWorkflow } from "@app/lib/notifications/workflows/provider-credential-updated";
import { skillSuggestionsReadyWorkflow } from "@app/lib/notifications/workflows/skill-suggestions-ready";
import { serve } from "@novu/framework/next";

// This endpoint exposes our code-based notifications workflows to the Novu platform.
// We triggered a sync during deployment to ensure the workflows are available on the Novu platform.
// Then the Novu platform will call this endpoint to execute the workflows steps.
// Other workflows can be defined directly in the Novu platform.
// See: https://docs.novu.co/framework/endpoint
export default serve({
  workflows: [
    conversationUnreadWorkflow,
    agentMessageFeedbackWorkflow,
    agentSuggestionsReadyWorkflow,
    skillSuggestionsReadyWorkflow,
    projectAddedAsMemberWorkflow,
    providerCredentialsHealthUpdatedWorkflow,
  ],
});
