import {
  EmailGreeting,
  EmailLayout,
  renderEmailWithI18n,
} from "@app/lib/notifications/email-templates/_layout";
import type { I18n } from "@lingui/core";
import { z } from "zod";

export const DefaultEmailTemplatePropsSchema = z.object({
  name: z.string().optional(),
  workspace: z.object({
    id: z.string(),
    name: z.string(),
  }),
  content: z.string(),
  // Rendered large below the content, e.g. a login code.
  highlight: z.string().optional(),
  showNotificationPreferences: z.boolean().optional(),
  avatarUrl: z.string().optional(),
  action: z
    .object({
      label: z.string(),
      url: z.string(),
    })
    .optional(),
});

type DefaultEmailTemplateProps = z.infer<
  typeof DefaultEmailTemplatePropsSchema
>;

const DefaultEmailTemplate = ({
  name,
  workspace,
  content,
  highlight,
  showNotificationPreferences,
  action,
}: DefaultEmailTemplateProps) => {
  return (
    <EmailLayout
      workspace={workspace}
      showNotificationPreferences={showNotificationPreferences}
    >
      <h3>
        <EmailGreeting name={name} />
      </h3>
      {content.split("\n").map((line, index) => (
        <div key={index}>{line}</div>
      ))}
      {highlight && (
        <p
          style={{
            fontSize: "24px",
            fontWeight: "bold",
            letterSpacing: "4px",
            marginBlock: "20px",
          }}
        >
          {highlight}
        </p>
      )}

      {action?.label && action?.url && (
        <>
          <hr style={{ border: "1px solid #e0e0e0" }} />
          <a href={action.url} target="_blank">
            {action.label}
          </a>
        </>
      )}
    </EmailLayout>
  );
};

export function renderEmail({
  i18n,
  ...args
}: DefaultEmailTemplateProps & { i18n: I18n }) {
  return renderEmailWithI18n(i18n, <DefaultEmailTemplate {...args} />);
}
