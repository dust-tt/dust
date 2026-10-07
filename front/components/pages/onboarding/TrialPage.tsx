import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useAppRouter } from "@app/lib/platform";
import { Button, Check, DustLogoSquare, Icon, Page } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";

export function TrialPage() {
  const { workspace } = useAuth();
  const router = useAppRouter();
  const { hasFeature } = useFeatureFlags();
  const { t } = useLingui();

  const isMetronome = !hasFeature("legacy_billing");

  const skip = async () => {
    void router.push(`/w/${workspace.sId}/subscribe`);
  };

  const startFreePlan = async () => {
    void router.push(`/w/${workspace.sId}/verify`);
  };

  const legacyFeatures = [
    t`Free 14-day trial`,
    t`Advanced models (GPT-5, Claude..)`,
    t`Custom agents which can execute actions`,
    t`Connections (GitHub, Google Drive, Notion, Slack...)`,
    t`Native integrations (Zendesk, Slack, Chrome Extension)`,
    t`100 free messages`,
  ];

  // TODO: improve copy and design in a follow-up
  const freePlanFeatures = [
    t`Up to 5 users`,
    t`300 AI credits per user (lifetime)`,
    t`Advanced models (GPT-5, Claude..)`,
    t`Custom agents which can execute actions`,
    t`No credit card required · No time limit`,
  ];

  if (isMetronome) {
    // TODO: improve copy, layout and design in a follow-up
    return (
      <Page>
        <div className="flex h-full flex-col justify-center">
          <Page.Horizontal>
            <Page.Vertical sizing="grow" gap="lg">
              <DustLogoSquare className="-ml-11 h-10 w-32" />
              <Page.Header title={t`Get started for free`} />
              <p className="-mt-4 text-muted-foreground">
                <Trans>No credit card required · No time limit</Trans>
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
                  label={t`Start for free`}
                />
                <Button
                  onClick={skip}
                  variant="outline"
                  label={t`Subscribe now`}
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
            <Page.Header title={t`Start your free trial`} />
            <p className="-mt-4 text-muted-foreground">
              <Trans>No credit card required</Trans>
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
                label={t`Start free trial`}
              />
              <Button
                onClick={skip}
                variant="outline"
                label={t`Subscribe now`}
              />
            </div>
          </Page.Vertical>
        </Page.Horizontal>
      </div>
    </Page>
  );
}
