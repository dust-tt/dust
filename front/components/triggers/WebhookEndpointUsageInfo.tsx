import { InfoCircle, Page } from "@dust-tt/sparkle";
import { Trans } from "@lingui/react/macro";

type WebhookSourceDetailsInfoProps = {
  signatureAlgorithm: string;
  signatureHeader: string;
};

export function WebhookEndpointUsageInfo({
  signatureAlgorithm,
  signatureHeader,
}: WebhookSourceDetailsInfoProps) {
  return (
    <div className="mb-4">
      <div className="flex items-center space-x-2">
        <InfoCircle className="h-4 w-4 text-muted-foreground" />
        <Page.H variant="h4">
          <Trans>How to use this webhook</Trans>
        </Page.H>
      </div>
      <div className="mt-4 space-y-4">
        <div>
          <Page.H variant="h6">
            <Trans>Authentication</Trans>
          </Page.H>
          <div className="mt-2 space-y-2 text-sm text-muted-foreground">
            <p>
              <Trans>
                To authenticate your webhook requests, you need to sign the
                payload using the configured secret and algorithm:
              </Trans>
            </p>
            <ol className="ml-4 list-inside list-decimal space-y-1">
              <li>
                <Trans>
                  Hash the entire request payload using{" "}
                  <span className="rounded bg-primary-100 px-1 font-mono">
                    {signatureAlgorithm}
                  </span>{" "}
                  with the secret shown above
                </Trans>
              </li>
              <li>
                <Trans>
                  Include the resulting hash in the{" "}
                  <span className="rounded bg-primary-100 px-1 font-mono">
                    {signatureHeader}
                  </span>{" "}
                  header of your HTTP request, prefixed with{" "}
                  <span className="rounded bg-primary-100 px-1 font-mono">
                    {signatureAlgorithm}=
                  </span>
                </Trans>
              </li>
              <li>
                <Trans>
                  Send a POST request to the webhook URL with your payload as
                  JSON
                </Trans>
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
