import {
  EmailLayout,
  renderEmailWithI18n,
} from "@app/lib/notifications/email-templates/_layout";
import type { I18n } from "@lingui/core";
import { Trans } from "@lingui/react/macro";
import { z } from "zod";

export const DefaultEmailTemplatePropsSchema = z.object({
  name: z.string(),
  workspace: z.object({
    id: z.string(),
    name: z.string(),
  }),
  content: z.string(),
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
  action,
}: DefaultEmailTemplateProps) => {
  return (
    <EmailLayout workspace={workspace}>
      <h3>
        <Trans>Hi {name},</Trans>
      </h3>
      {content.split("\n").map((line, index) => (
        <div key={index}>{line}</div>
      ))}

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
