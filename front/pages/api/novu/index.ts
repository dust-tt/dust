import { serve } from "@novu/framework/next";

import { agentMessageFeedbackWorkflow } from "@app/lib/notifications/workflows/agent-message-feedback";
import { conversationAddedAsParticipantWorkflow } from "@app/lib/notifications/workflows/conversation-added-as-participant";
import { conversationUnreadWorkflow } from "@app/lib/notifications/workflows/conversation-unread";

// This endpoint exposes our code-based notifications workflows to the Novu platform.
// We triggered a sync during deployment to ensure the workflows are available on the Novu platform.
// Then the Novu platform will call this endpoint to execute the workflows steps.
// Other workflows can be defined directly in the Novu platform.
// See: https://docs.novu.co/framework/endpoint
export default serve({
  workflows: [
    conversationUnreadWorkflow,
    conversationAddedAsParticipantWorkflow,
    agentMessageFeedbackWorkflow,
  ],
});
