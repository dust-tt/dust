import { render } from "@react-email/render";
import * as React from "react";
import { z } from "zod";

import { EmailLayout } from "@app/lib/notifications/email-templates/_layout";
import { getConversationRoute } from "@app/lib/utils/router";

export const AgentMessageFeedbackDigestEmailTemplatePropsSchema = z.object({
  name: z.string(),
  workspace: z.object({
    id: z.string(),
    name: z.string(),
  }),
  feedbacks: z.array(
    z.object({
      agentName: z.string(),
      conversationId: z.string(),
      conversationTitle: z.string(),
      userWhoGaveFeedbackFullName: z.string(),
      thumbDirection: z.union([z.literal("up"), z.literal("down")]),
      feedbackContent: z.string().optional(),
    })
  ),
});

type AgentMessageFeedbackDigestEmailTemplateProps = z.infer<
  typeof AgentMessageFeedbackDigestEmailTemplatePropsSchema
>;

const AgentMessageFeedbackDigestEmailTemplate = ({
  name,
  workspace,
  feedbacks,
}: AgentMessageFeedbackDigestEmailTemplateProps) => {
  const positiveCount = feedbacks.filter(
    (f) => f.thumbDirection === "up"
  ).length;
  const negativeCount = feedbacks.filter(
    (f) => f.thumbDirection === "down"
  ).length;

  return (
    <EmailLayout workspace={workspace}>
      <h3>Hi {name},</h3>
      <p>
        You received {feedbacks.length} feedback
        {feedbacks.length > 1 ? "s" : ""} on your agents today:
      </p>
      <p style={{ marginBottom: "20px" }}>
        👍 {positiveCount} positive • 👎 {negativeCount} negative
      </p>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {feedbacks.map((feedback, index) => (
          <li
            key={index}
            style={{
              marginBottom: "20px",
              borderBottom: "1px solid #e0e0e0",
              paddingBottom: "15px",
            }}
          >
            <div>
              <strong>
                {feedback.thumbDirection === "up" ? "👍" : "👎"}{" "}
                {feedback.agentName}
              </strong>
            </div>
            <div style={{ color: "#666", fontSize: "14px", marginTop: "5px" }}>
              by {feedback.userWhoGaveFeedbackFullName} in{" "}
              <a
                href={
                  process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL +
                  getConversationRoute(workspace.id, feedback.conversationId)
                }
                target="_blank"
              >
                {feedback.conversationTitle}
              </a>
            </div>
            {feedback.feedbackContent && (
              <div
                style={{
                  marginTop: "8px",
                  padding: "10px",
                  backgroundColor: "#f5f5f5",
                  borderRadius: "4px",
                  fontStyle: "italic",
                }}
              >
                "{feedback.feedbackContent}"
              </div>
            )}
          </li>
        ))}
      </ul>
    </EmailLayout>
  );
};

export function renderEmail(
  args: AgentMessageFeedbackDigestEmailTemplateProps
) {
  return render(<AgentMessageFeedbackDigestEmailTemplate {...args} />);
}
