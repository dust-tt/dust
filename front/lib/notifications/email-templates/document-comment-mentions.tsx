import {
  EmailGreeting,
  EmailLayout,
  renderEmailWithI18n,
} from "@app/lib/notifications/email-templates/_layout";
import type { I18n } from "@lingui/core";
import { z } from "zod";

export const DocumentCommentMentionsEmailTemplatePropsSchema = z.object({
  name: z.string().optional(),
  workspace: z.object({
    id: z.string(),
    name: z.string(),
  }),
  mentions: z.array(
    z.object({
      text: z.string(),
      url: z.string(),
    })
  ),
});

type DocumentCommentMentionsEmailTemplateProps = z.infer<
  typeof DocumentCommentMentionsEmailTemplatePropsSchema
>;

const DocumentCommentMentionsEmailTemplate = ({
  name,
  workspace,
  mentions,
}: DocumentCommentMentionsEmailTemplateProps) => (
  <EmailLayout workspace={workspace}>
    <p>
      <EmailGreeting name={name} />
    </p>
    {mentions.map(({ text, url }, index) => (
      <h4 key={index}>
        <a href={url} target="_blank">
          {text}
        </a>
      </h4>
    ))}
  </EmailLayout>
);

export function renderEmail({
  i18n,
  ...args
}: DocumentCommentMentionsEmailTemplateProps & { i18n: I18n }) {
  return renderEmailWithI18n(
    i18n,
    <DocumentCommentMentionsEmailTemplate {...args} />
  );
}
