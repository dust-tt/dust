import { EmailLayout } from "@app/lib/notifications/email-templates/_layout";
import { render } from "@react-email/render";
import { z } from "zod";

export const ActivationNewConversationEmailTemplatePropsSchema = z.object({
  name: z.string(),
  workspace: z.object({
    id: z.string(),
    name: z.string(),
  }),
  podName: z.string(),
  purpose: z.string().nullable(),
  summary: z.string().nullable(),
  frameImageUrl: z.string().nullable(),
  frameUrl: z.string().nullable(),
  action: z.object({
    label: z.string(),
    url: z.string(),
  }),
});

type ActivationNewConversationEmailTemplateProps = z.infer<
  typeof ActivationNewConversationEmailTemplatePropsSchema
>;

const ActivationNewConversationEmailTemplate = ({
  name,
  workspace,
  podName,
  purpose,
  summary,
  frameImageUrl,
  frameUrl,
  action,
}: ActivationNewConversationEmailTemplateProps) => {
  const frameLink = frameUrl ?? action.url;
  return (
    <EmailLayout workspace={workspace}>
      <p style={{ fontSize: "15px", color: "#111418", margin: "0 0 4px 0" }}>
        Hi {name}!
      </p>
      <p
        style={{
          fontSize: "15px",
          color: "#111418",
          margin: "0 0 20px 0",
          lineHeight: "1.5",
        }}
      >
        {purpose
          ? `We put something together to ${purpose}. Take a look:`
          : `We put something together for you. Take a look:`}
      </p>

      {/* Text hyperlink into the activation conversation */}
      <p style={{ fontSize: "15px", margin: "0 0 20px 0" }}>
        <a
          href={action.url}
          target="_blank"
          style={{ color: "#1C91FF", textDecoration: "underline" }}
        >
          {action.label}
        </a>
      </p>

      {/* Frame preview: a static PNG screenshot of the pod Frame generated for
          this conversation, linked to the live interactive Frame.*/}
      {frameImageUrl && (
        <div style={{ margin: "0 0 20px 0" }}>
          <a
            href={frameLink}
            target="_blank"
            style={{ textDecoration: "none" }}
          >
            <img
              alt={`${podName} preview`}
              src={frameImageUrl}
              style={{
                display: "block",
                width: "100%",
                maxWidth: "600px",
                height: "auto",
                border: "1px solid #E5E7EB",
                borderRadius: "8px",
                margin: "0 0 5px 0",
              }}
            />
          </a>
          <a
            href={frameLink}
            target="_blank"
            style={{
              fontSize: "14px",
              color: "#1C91FF",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            ▶ Open interactive view
          </a>
        </div>
      )}

      {summary && (
        <p
          style={{
            fontSize: "14px",
            color: "#64707D",
            margin: "0 0 20px 0",
            lineHeight: "1.5",
          }}
        >
          {summary}
        </p>
      )}
    </EmailLayout>
  );
};

export function renderEmail(args: ActivationNewConversationEmailTemplateProps) {
  return render(<ActivationNewConversationEmailTemplate {...args} />);
}
