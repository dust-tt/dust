import { LinkWrapper, useSearchParam } from "@app/lib/platform";
import { Button, DustLogoSquare, Icon, Page } from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";

const defaultErrorMessageClassName = "text-base text-primary-100";

interface MaintenancePageInfo {
  title: string;
  message: React.ReactNode;
  buttonLabel: string;
  buttonUrl: string;
  buttonAction?: () => void;
}

function getMaintenancePageInfo(
  code: string,
  t: (descriptor: MessageDescriptor) => string
): MaintenancePageInfo {
  switch (code) {
    case "relocation":
      return {
        title: t(msg`Service relocation in progress`),
        message: (
          <>
            <p className={defaultErrorMessageClassName}>
              <Trans>
                Your account is currently being relocated to a new region.
                During this planned migration, you won't be able to access our
                application. This temporary interruption ensures a smooth
                transition of your organization's data.
              </Trans>
            </p>
            <h4 className="heading-xl text-primary-50">
              <Trans>What's happening?</Trans>
            </h4>
            <p className={defaultErrorMessageClassName}>
              <Trans>
                As discussed with your team, we're moving your account to a
                different regional infrastructure. All your data, settings, and
                configurations will remain exactly as they were. We'll notify
                your team once the relocation is complete and your access is
                restored.
              </Trans>
            </p>
          </>
        ),
        buttonLabel: t(msg`Back to homepage`),
        buttonUrl: "/",
      };

    // This case should no longer happen now that region relocation is handled
    // differently. Kept for safety — the button reloads the page so the user
    // gets redirected to the correct region automatically.
    case "relocation-done":
      return {
        title: t(msg`Service relocation complete`),
        message: (
          <p className={defaultErrorMessageClassName}>
            <Trans>
              Your account has been successfully relocated to a new region. You
              can now access our application.
            </Trans>
          </p>
        ),
        buttonLabel: t(msg`Reload`),
        buttonUrl: "/",
        buttonAction: () => window.location.reload(),
      };

    default:
      return {
        title: t(msg`Under maintenance`),
        message: (
          <>
            <p className={defaultErrorMessageClassName}>
              <Trans>
                We're currently performing maintenance on this workspace.
                <br />
                Please check back in a few minutes.
              </Trans>
            </p>
            <p className="text-sm italic text-primary-300">
              <Trans>
                If this persists for an extended period,
                <br />
                please contact us at support@dust.tt
              </Trans>
            </p>
          </>
        ),
        buttonLabel: t(msg`Back to homepage`),
        buttonUrl: "/",
      };
  }
}

export function MaintenancePage() {
  const { t } = useLingui();
  const code = useSearchParam("code");
  const maintenancePageInfo = getMaintenancePageInfo(code ?? "", t);

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 top-0 -z-50 bg-primary-800" />
      <main className="z-10 mx-6">
        <div className="flex h-full flex-col items-center justify-center">
          <div className="flex flex-col items-center gap-6 text-center">
            <Icon visual={DustLogoSquare} size="lg" />
            <div className="mx-20 flex flex-col items-center gap-6">
              <Page.Header
                title={
                  <span className="text-primary-50">
                    {maintenancePageInfo.title}
                  </span>
                }
              />
              {maintenancePageInfo.message}
            </div>
            {maintenancePageInfo.buttonAction ? (
              <Button
                variant="outline"
                label={maintenancePageInfo.buttonLabel}
                size="sm"
                onClick={maintenancePageInfo.buttonAction}
              />
            ) : (
              <LinkWrapper href={maintenancePageInfo.buttonUrl}>
                <Button
                  variant="outline"
                  label={maintenancePageInfo.buttonLabel}
                  size="sm"
                />
              </LinkWrapper>
            )}
          </div>
        </div>
      </main>
    </>
  );
}

export default MaintenancePage;
