import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@dust-tt/sparkle";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";

const REDIRECT_URIS = [
  "https://app.dust.tt/oauth/mcp_static/finalize",
  "https://eu.dust.tt/oauth/mcp_static/finalize",
  "https://dust.tt/oauth/mcp_static/finalize",
];

export function NetSuiteSetupInstructions() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="w-full pt-4">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger hideChevron>
          <div className="flex w-full items-center gap-2 rounded-lg border border-border bg-muted/50 p-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted dark:border-border-night dark:bg-muted-night/50 dark:text-foreground-night dark:hover:bg-muted-night">
            {isOpen ? (
              <ChevronDownIcon className="h-4 w-4 shrink-0" />
            ) : (
              <ChevronRightIcon className="h-4 w-4 shrink-0" />
            )}
            <span>NetSuite OAuth Setup Guide</span>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-3 space-y-4 rounded-lg border border-border bg-background p-4 text-sm dark:border-border-night dark:bg-background-night">
            <p className="text-muted-foreground dark:text-muted-foreground-night">
              Before connecting, you need{" "}
              <strong>NetSuite administrator access</strong> to enable the
              required features and create an integration record. Replace{" "}
              <code className="rounded bg-muted px-1 dark:bg-muted-night">
                {"<accountId>"}
              </code>{" "}
              throughout with your NetSuite account ID (e.g.{" "}
              <code className="rounded bg-muted px-1 dark:bg-muted-night">
                td3485262
              </code>
              ).
            </p>

            <div className="space-y-4">
              <div>
                <p className="mb-2 font-medium text-foreground dark:text-foreground-night">
                  1. Enable required NetSuite features
                </p>
                <p className="mb-2 text-muted-foreground dark:text-muted-foreground-night">
                  In NetSuite, go to{" "}
                  <strong>
                    Setup → Company → Enable Features → SuiteCloud
                  </strong>{" "}
                  and enable:
                </p>
                <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs dark:bg-muted-night">
                  {
                    "Server SuiteScript\nREST Web Services\nToken-Based Authentication\nOAuth 2.0"
                  }
                </pre>
              </div>

              <div>
                <p className="mb-2 font-medium text-foreground dark:text-foreground-night">
                  2. Install the MCP Standard Tools SuiteApp
                </p>
                <p className="text-muted-foreground dark:text-muted-foreground-night">
                  Install the <strong>MCP Standard Tools SuiteApp</strong> from
                  the SuiteApp marketplace. This provides the tools Dust will
                  use to interact with your NetSuite account.
                </p>
              </div>

              <div>
                <p className="mb-2 font-medium text-foreground dark:text-foreground-night">
                  3. Create a custom role
                </p>
                <p className="text-muted-foreground dark:text-muted-foreground-night">
                  Go to{" "}
                  <strong>Setup → Users/Roles → Manage Roles → New</strong>. The{" "}
                  <strong>Administrator</strong> role cannot be used. Your
                  custom role must include the following permissions:{" "}
                  <strong>MCP Server Connection</strong>,{" "}
                  <strong>OAuth 2.0 Access Tokens</strong>, and{" "}
                  <strong>Login using OAuth 2.0 Access Tokens</strong>. Assign
                  this role to the user who will authenticate with Dust.
                </p>
              </div>

              <div>
                <p className="mb-2 font-medium text-foreground dark:text-foreground-night">
                  4. Create an integration record
                </p>
                <p className="mb-2 text-muted-foreground dark:text-muted-foreground-night">
                  Go to{" "}
                  <strong>
                    Setup → Integration → Manage Integrations → New
                  </strong>
                  . Name it "Dust NetSuite MCP", enable{" "}
                  <strong>OAuth 2.0</strong> as the authentication method, and
                  add these three redirect URIs:
                </p>
                <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs dark:bg-muted-night">
                  {REDIRECT_URIS.join("\n")}
                </pre>
                <p className="mt-2 text-muted-foreground dark:text-muted-foreground-night">
                  Save the record and copy the{" "}
                  <strong>Consumer Key (Client ID)</strong> and{" "}
                  <strong>Consumer Secret (Client Secret)</strong> — they won't
                  be visible again.
                </p>
              </div>

              <div>
                <p className="mb-2 font-medium text-foreground dark:text-foreground-night">
                  5. Enter credentials below
                </p>
                <p className="mb-3 text-muted-foreground dark:text-muted-foreground-night">
                  Fill in the OAuth fields using the values below. Replace{" "}
                  <code className="rounded bg-muted px-1 dark:bg-muted-night">
                    {"<accountId>"}
                  </code>{" "}
                  with your NetSuite account ID.
                </p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border dark:border-border-night">
                      <th className="pb-2 pr-4 text-left font-medium text-foreground dark:text-foreground-night">
                        Field
                      </th>
                      <th className="pb-2 text-left font-medium text-foreground dark:text-foreground-night">
                        Value
                      </th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground dark:text-muted-foreground-night">
                    <tr className="border-b border-border/50 dark:border-border-night/50">
                      <td className="py-2 pr-4 font-medium text-foreground dark:text-foreground-night">
                        Server URL
                      </td>
                      <td className="py-2 font-mono">
                        https://{"<accountId>"}
                        .suitetalk.api.netsuite.com/services/mcp/v1/suiteapp/com.netsuite.mcpstandardtools
                      </td>
                    </tr>
                    <tr className="border-b border-border/50 dark:border-border-night/50">
                      <td className="py-2 pr-4 font-medium text-foreground dark:text-foreground-night">
                        Client ID
                      </td>
                      <td className="py-2">
                        Consumer Key from the integration record (step 4)
                      </td>
                    </tr>
                    <tr className="border-b border-border/50 dark:border-border-night/50">
                      <td className="py-2 pr-4 font-medium text-foreground dark:text-foreground-night">
                        Client Secret
                      </td>
                      <td className="py-2">
                        Consumer Secret from the integration record (step 4)
                      </td>
                    </tr>
                    <tr className="border-b border-border/50 dark:border-border-night/50">
                      <td className="py-2 pr-4 font-medium text-foreground dark:text-foreground-night">
                        Authorization URL
                      </td>
                      <td className="py-2 font-mono">
                        https://{"<accountId>"}
                        .app.netsuite.com/app/login/oauth2/authorize.nl
                      </td>
                    </tr>
                    <tr className="border-b border-border/50 dark:border-border-night/50">
                      <td className="py-2 pr-4 font-medium text-foreground dark:text-foreground-night">
                        Token URL
                      </td>
                      <td className="py-2 font-mono">
                        https://{"<accountId>"}
                        .suitetalk.api.netsuite.com/services/rest/auth/oauth2/v1/token
                      </td>
                    </tr>
                    <tr>
                      <td className="pt-2 pr-4 font-medium text-foreground dark:text-foreground-night">
                        Scope
                      </td>
                      <td className="pt-2 font-mono">mcp</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
