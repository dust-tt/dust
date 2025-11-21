import { render } from "@react-email/render";
import * as React from "react";
import { z } from "zod";

import { EmailLayout } from "@app/lib/notifications/email-templates/_layout";

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
      <h3>Hi {name},</h3>
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

export function renderEmail(args: DefaultEmailTemplateProps) {
  return render(<DefaultEmailTemplate {...args} />);
}
