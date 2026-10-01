import config from "@app/lib/api/config";
import {
  EmailLayout,
  renderEmailWithI18n,
} from "@app/lib/notifications/email-templates/_layout";
import { getConversationRoute } from "@app/lib/utils/router";
import type { I18n } from "@lingui/core";
import { Plural, Trans } from "@lingui/react/macro";
import { z } from "zod";

const AgentMessageFeedbackDigestEmailTemplatePropsSchema = z.object({
  name: z.string(),
  workspace: z.object({
    id: z.string(),
    name: z.string(),
  }),
  feedbacks: z.array(
    z.object({
      agentName: z.string(),
      // Only set when the user who gave the feedback shared the conversation.
      conversation: z
        .object({
          id: z.string(),
          title: z.string(),
        })
        .optional(),
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
  const feedbackCount = feedbacks.length;
  const positiveCount = feedbacks.filter(
    (f) => f.thumbDirection === "up"
  ).length;
  const negativeCount = feedbacks.filter(
    (f) => f.thumbDirection === "down"
  ).length;

  return (
    <EmailLayout workspace={workspace}>
      <h3>
        <Trans>Hi {name},</Trans>
      </h3>
      <p>
        <Plural
          value={feedbackCount}
          one="You received # feedback on your agents today:"
          other="You received # feedbacks on your agents today:"
        />
      </p>
      <p style={{ marginBottom: "20px" }}>
        <Trans>
          👍 {positiveCount} positive • 👎 {negativeCount} negative
        </Trans>
      </p>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {feedbacks.map((feedback, index) => {
          const userName = feedback.userWhoGaveFeedbackFullName;
          const { conversation, feedbackContent } = feedback;
          const conversationTitle = conversation?.title;
          return (
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
              <div
                style={{ color: "#666", fontSize: "14px", marginTop: "5px" }}
              >
                {conversation ? (
                  <Trans context="feedback author">
                    by {userName} in{" "}
                    <a
                      href={
                        config.getAppUrl() +
                        getConversationRoute(workspace.id, conversation.id)
                      }
                      target="_blank"
                    >
                      {conversationTitle}
                    </a>
                  </Trans>
                ) : (
                  <Trans context="feedback author">by {userName}</Trans>
                )}
              </div>
              {feedbackContent && (
                <div
                  style={{
                    marginTop: "8px",
                    padding: "10px",
                    backgroundColor: "#f5f5f5",
                    borderRadius: "4px",
                    fontStyle: "italic",
                  }}
                >
                  <Trans context="quoted feedback">"{feedbackContent}"</Trans>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </EmailLayout>
  );
};

export function renderEmail({
  i18n,
  ...args
}: AgentMessageFeedbackDigestEmailTemplateProps & { i18n: I18n }) {
  return renderEmailWithI18n(
    i18n,
    <AgentMessageFeedbackDigestEmailTemplate {...args} />
  );
}
