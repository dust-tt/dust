import { InformationCircleIcon, Page } from "@dust-tt/sparkle";

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
        <InformationCircleIcon className="h-4 w-4 text-muted-foreground dark:text-muted-foreground-night" />
        <Page.H variant="h4">How to Use This Webhook</Page.H>
      </div>
      <div className="mt-4 space-y-4">
        <div>
          <Page.H variant="h6">Authentication</Page.H>
          <div className="mt-2 space-y-2 text-sm text-muted-foreground dark:text-muted-foreground-night">
            <p>
              To authenticate your webhook requests, you need to sign the
              payload using the configured secret and algorithm:
            </p>
            <ol className="ml-4 list-inside list-decimal space-y-1">
              <li>
                Hash the entire request payload using{" "}
                <span className="rounded bg-gray-100 px-1 font-mono dark:bg-gray-800">
                  {signatureAlgorithm}
                </span>{" "}
                with the secret shown above
              </li>
              <li>
                Include the resulting hash in the{" "}
                <span className="rounded bg-gray-100 px-1 font-mono dark:bg-gray-800">
                  {signatureHeader}
                </span>{" "}
                header of your HTTP request, prefixed with{" "}
                <span className="rounded bg-gray-100 px-1 font-mono dark:bg-gray-800">
                  {signatureAlgorithm}=
                </span>
              </li>
              <li>
                Send a POST request to the webhook URL with your payload as JSON
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
