import config from "@app/lib/api/config";
import type { I18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Html } from "@react-email/html";
import { render } from "@react-email/render";
import type React from "react";

export const EmailLayout = ({
  workspace,
  showNotificationPreferences = true,
  children,
}: {
  workspace: { id: string; name: string };
  // Off for emails sent to people outside the workspace or that cannot be turned off.
  showNotificationPreferences?: boolean;
  children: React.ReactNode;
}) => {
  const { i18n, t } = useLingui();
  const workspaceName = workspace.name;
  const workspaceUrl = `${config.getAppUrl()}/w/${workspace.id}`;
  return (
    <Html lang={i18n.locale}>
      <head>
        <title>{t`An email from Dust about ${workspaceName}`}</title>
      </head>
      <body
        style={{
          fontFamily: "Open Sans, Helvetica Neue, Helvetica, Arial, sans-serif",
          fontSize: "14px",
          backgroundColor: "#ffffff",
          padding: "20px",
        }}
      >
        <div
          style={{
            maxWidth: "600px",
            backgroundColor: "#ffffff",
          }}
        >
          {children}
        </div>
        <div style={{ width: "100%", textAlign: "left", marginTop: "20px" }}>
          <a href={config.getStaticWebsiteUrl()} target="_new">
            <img
              alt={t`Dust logo`}
              style={{ margin: "0 auto", border: "0px" }}
              width={96}
              height={24}
              src="https://dust.tt/static/landing/logos/dust/Dust_Logo.png"
            />
          </a>
        </div>
        <div
          style={{
            width: "100%",
            textAlign: "left",
            marginTop: "20px",
            fontSize: "12px",
            color: "#969CA5",
          }}
        >
          <div>
            <Trans>This is an automated email. Please do not reply.</Trans>
          </div>
          {showNotificationPreferences && (
            <div>
              <Trans>
                You can manage your notification preferences from{" "}
                <a
                  href={workspaceUrl}
                  target="_blank"
                  style={{ color: "#1C91FF" }}
                >
                  your workspace
                </a>
                .
              </Trans>
            </div>
          )}
        </div>
      </body>
    </Html>
  );
};

// Greets the recipient by first name, or with a generic greeting when we don't know it. Keep both
// greetings as whole sentences so translators never have to compose "Hi" with a stand-in name.
export const EmailGreeting = ({ name }: { name?: string }) => {
  return name ? <Trans>Hi {name},</Trans> : <Trans>Hi there,</Trans>;
};

// Every email renders inside `EmailLayout`, which needs a Lingui context: pass the recipient's
// instance from `getNotificationI18n`.
export function renderEmailWithI18n(i18n: I18n, email: React.ReactElement) {
  return render(<I18nProvider i18n={i18n}>{email}</I18nProvider>);
}
