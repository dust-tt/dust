export type EmailComposeFields = {
  to: boolean;
  cc: boolean;
  bcc: boolean;
  subject: boolean;
  body: boolean;
};

type EmailComposeToolsConfig = Record<
  string,
  Record<string, EmailComposeFields>
>;

export const EMAIL_COMPOSE_TOOLS: EmailComposeToolsConfig = {
  gmail: {
    create_draft: {
      to: true,
      cc: true,
      bcc: true,
      subject: true,
      body: true,
    },
    create_reply_draft: {
      to: true,
      cc: true,
      bcc: true,
      subject: false,
      body: true,
    },
    send_mail: {
      to: true,
      cc: true,
      bcc: true,
      subject: true,
      body: true,
    },
  },
};

export function getEmailComposeFields(
  mcpServerName: string,
  toolName: string
): EmailComposeFields | null {
  return EMAIL_COMPOSE_TOOLS[mcpServerName]?.[toolName] ?? null;
}

export function isEmailComposeTool(
  mcpServerName: string,
  toolName: string
): boolean {
  return getEmailComposeFields(mcpServerName, toolName) !== null;
}
