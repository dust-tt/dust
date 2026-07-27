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
          color: "#111418",
          margin: "0 0 20px 0",
          lineHeight: "1.5",
        }}
      >
        {purpose
          ? `We put something together to help ${purpose}. Take a look:`
          : `We put something together for you in ${podName}. Take a look:`}
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

      {summary && (
        <p
          style={{
            fontSize: "14px",
            color: "#64707D",
            margin: "0 0 20px 0",
            lineHeight: "1.55",
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
