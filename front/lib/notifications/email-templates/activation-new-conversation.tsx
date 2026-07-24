import { EmailLayout } from "@app/lib/notifications/email-templates/_layout";
import { render } from "@react-email/render";
import { z } from "zod";

export const ActivationNewConversationEmailTemplatePropsSchema = z.object({
  name: z.string(),
  workspace: z.object({
    id: z.string(),
    name: z.string(),
  }),
  title: z.string(),
  summary: z.string().nullable(),
  previewImageUrl: z.string().optional(),
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
  title,
  summary,
  previewImageUrl,
  action,
}: ActivationNewConversationEmailTemplateProps) => {
  return (
    <EmailLayout workspace={workspace}>
      <p style={{ fontSize: "15px", color: "#111418", margin: "0 0 4px 0" }}>
        Hi {name},
      </p>
      <p
        style={{
          fontSize: "15px",
          color: "#64707D",
          margin: "0 0 20px 0",
          lineHeight: "1.5",
        }}
      >
        We put something together for you in {workspace.name}. Take a look:
      </p>

      {/* Card: headline + optional preview image + summary, all clickable. */}
      <a
        href={action.url}
        target="_blank"
        style={{ textDecoration: "none", color: "inherit" }}
      >
        <div
          style={{
            border: "1px solid #E4E7EB",
            borderRadius: "12px",
            overflow: "hidden",
            backgroundColor: "#ffffff",
          }}
        >
          {/* Preview image slot. Rendered only when an image is available. */}
          {previewImageUrl && (
            <img
              alt={title}
              src={previewImageUrl}
              width="100%"
              style={{
                display: "block",
                width: "100%",
                maxWidth: "100%",
                height: "auto",
                borderBottom: "1px solid #E4E7EB",
              }}
            />
          )}

          <div style={{ padding: "20px" }}>
            <h2
              style={{
                fontSize: "18px",
                fontWeight: 600,
                color: "#111418",
                margin: "0 0 8px 0",
                lineHeight: "1.35",
              }}
            >
              {title}
            </h2>
            {summary && (
              <p
                style={{
                  fontSize: "14px",
                  color: "#64707D",
                  margin: 0,
                  lineHeight: "1.55",
                }}
              >
                {summary}
              </p>
            )}
          </div>
        </div>
      </a>

      {/* Single, clear call-to-action into the conversation. */}
      <div style={{ marginTop: "24px" }}>
        <a
          href={action.url}
          target="_blank"
          style={{
            display: "inline-block",
            backgroundColor: "#1C91FF",
            color: "#ffffff",
            fontSize: "15px",
            fontWeight: 600,
            textDecoration: "none",
            padding: "12px 24px",
            borderRadius: "10px",
          }}
        >
          {action.label}
        </a>
      </div>
    </EmailLayout>
  );
};

export function renderEmail(args: ActivationNewConversationEmailTemplateProps) {
  return render(<ActivationNewConversationEmailTemplate {...args} />);
}
