import {
  Button,
  CheckIcon,
  DustLogoSquare,
  Icon,
  Page,
} from "@dust-tt/sparkle";
import type { ReactElement } from "react";
import React from "react";

import { AppAuthContextLayout } from "@app/components/sparkle/AppAuthContextLayout";
import { ThemeProvider } from "@app/components/sparkle/ThemeContext";
import type { AppPageWithLayout } from "@app/lib/auth/appServerSideProps";
import { appGetServerSidePropsPaywallWhitelistedForAdmin } from "@app/lib/auth/appServerSideProps";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useAppRouter } from "@app/lib/platform";

export const getServerSideProps =
  appGetServerSidePropsPaywallWhitelistedForAdmin;

function Trial() {
  const { workspace } = useAuth();
  const router = useAppRouter();

  const skip = async () => {
    void router.push(`/w/${workspace.sId}/subscribe`);
  };

  const startTrial = async () => {
    void router.push(`/w/${workspace.sId}/verify`);
  };

  const features = [
    "Free 30-day trial",
    "Advanced models (GPT-5, Claude..)",
    "Custom agents which can execute actions",
    "Connections (GitHub, Google Drive, Notion, Slack...)",
    "Native integrations (Zendesk, Slack, Chrome Extension)",
    "100 free messages",
  ];

  return (
    <ThemeProvider>
      <Page>
        <div className="flex h-full flex-col justify-center">
          <Page.Horizontal>
            <Page.Vertical sizing="grow" gap="lg">
              <Page.Header
                title="Start your free trial"
                icon={() => <DustLogoSquare className="-ml-11 h-10 w-32" />}
              />
              <p className="-mt-4 text-muted-foreground dark:text-muted-foreground-night">
                No credit card required
              </p>

              <ul className="flex flex-col gap-4">
                {features.map((feature, index) => (
                  <li key={index} className="flex items-center gap-3">
                    <Icon
                      visual={CheckIcon}
                      size="sm"
                      className="text-primary-500"
                    />
                    <span className="text-foreground dark:text-foreground-night">
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="flex flex-row gap-3">
                <Button
                  onClick={startTrial}
                  variant="primary"
                  label="Start free trial"
                />
                <Button onClick={skip} variant="outline" label="Skip for now" />
              </div>
            </Page.Vertical>
          </Page.Horizontal>
        </div>
      </Page>
    </ThemeProvider>
  );
}

const TrialPage = Trial as AppPageWithLayout;

TrialPage.getLayout = (page: ReactElement, pageProps: AuthContextValue) => {
  return (
    <AppAuthContextLayout authContext={pageProps}>{page}</AppAuthContextLayout>
  );
};

export default TrialPage;
