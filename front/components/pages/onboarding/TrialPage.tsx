import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useAppRouter } from "@app/lib/platform";
import { Button, Check, DustLogoSquare, Icon, Page } from "@dust-tt/sparkle";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React from "react";

export function TrialPage() {
  const { workspace } = useAuth();
  const router = useAppRouter();
  const { hasFeature } = useFeatureFlags();

  const isMetronome = !hasFeature("legacy_billing");

  const skip = async () => {
    void router.push(`/w/${workspace.sId}/subscribe`);
  };

  const startFreePlan = async () => {
    void router.push(`/w/${workspace.sId}/verify`);
  };

  const legacyFeatures = [
    "Free 14-day trial",
    "Advanced models (GPT-5, Claude..)",
    "Custom agents which can execute actions",
    "Connections (GitHub, Google Drive, Notion, Slack...)",
    "Native integrations (Zendesk, Slack, Chrome Extension)",
    "100 free messages",
  ];

  // TODO: improve copy and design in a follow-up
  const freePlanFeatures = [
    "Up to 5 users",
    "300 AI credits per user (lifetime)",
    "Advanced models (GPT-5, Claude..)",
    "Custom agents which can execute actions",
    "No credit card required · No time limit",
  ];

  if (isMetronome) {
    // TODO: improve copy, layout and design in a follow-up
    return (
      <Page>
        <div className="flex h-full flex-col justify-center">
          <Page.Horizontal>
            <Page.Vertical sizing="grow" gap="lg">
              <DustLogoSquare className="-ml-11 h-10 w-32" />
              <Page.Header title="Get started for free" />
              <p className="-mt-4 text-muted-foreground">
                No credit card required · No time limit
              </p>

              <ul className="flex flex-col gap-4">
                {freePlanFeatures.map((feature, index) => (
                  <li key={index} className="flex items-center gap-3">
                    <Icon
                      visual={Check}
                      size="sm"
                      className="text-primary-500"
                    />
                    <span className="text-foreground">{feature}</span>
                  </li>
                ))}
              </ul>

              <div className="flex flex-row gap-3">
                <Button
                  onClick={startFreePlan}
                  variant="primary"
                  label="Start for free"
                />
                <Button
                  onClick={skip}
                  variant="outline"
                  label="Subscribe now"
                />
              </div>
            </Page.Vertical>
          </Page.Horizontal>
        </div>
      </Page>
    );
  }

  return (
    <Page>
      <div className="flex h-full flex-col justify-center">
        <Page.Horizontal>
          <Page.Vertical sizing="grow" gap="lg">
            <DustLogoSquare className="-ml-11 h-10 w-32" />
            <Page.Header title="Start your free trial" />
            <p className="-mt-4 text-muted-foreground">
              No credit card required
            </p>
            <ul className="flex flex-col gap-4">
              {legacyFeatures.map((feature, index) => (
                <li key={index} className="flex items-center gap-3">
                  <Icon visual={Check} size="sm" className="text-primary-500" />
                  <span className="text-foreground">{feature}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-row gap-3">
              <Button
                onClick={startFreePlan}
                variant="primary"
                label="Start free trial"
              />
              <Button onClick={skip} variant="outline" label="Subscribe now" />
            </div>
          </Page.Vertical>
        </Page.Horizontal>
      </div>
    </Page>
  );
}
