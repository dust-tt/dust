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

export function PowerBiSetupInstructions() {
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
            <span>Power BI OAuth Setup Guide</span>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-3 space-y-4 rounded-lg border border-border bg-background p-4 text-sm dark:border-border-night dark:bg-background-night">
            <p className="text-muted-foreground dark:text-muted-foreground-night">
              Before connecting, register an application in{" "}
              <strong>Microsoft Entra ID</strong> to obtain OAuth credentials.
              You need <strong>Microsoft Entra admin access</strong> and the{" "}
              <strong>MCP feature enabled</strong> in your Power BI admin
              portal.
            </p>

            <div className="space-y-4">
              <div>
                <p className="mb-2 font-medium text-foreground dark:text-foreground-night">
                  1. Register an app in Microsoft Entra
                </p>
                <p className="text-muted-foreground dark:text-muted-foreground-night">
                  Go to{" "}
                  <strong>
                    entra.microsoft.com → App registrations → New registration
                  </strong>
                  . Name it "Dust Power BI MCP", select{" "}
                  <strong>organizational directory only</strong>, and leave the
                  redirect URI blank for now. Note the{" "}
                  <strong>Application (client) ID</strong> and{" "}
                  <strong>Directory (tenant) ID</strong>.
                </p>
              </div>

              <div>
                <p className="mb-2 font-medium text-foreground dark:text-foreground-night">
                  2. Configure authentication
                </p>
                <p className="mb-2 text-muted-foreground dark:text-muted-foreground-night">
                  In the <strong>Authentication</strong> section, add these
                  three redirect URIs:
                </p>
                <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs dark:bg-muted-night">
                  {REDIRECT_URIS.join("\n")}
                </pre>
                <p className="mt-2 text-muted-foreground dark:text-muted-foreground-night">
                  Also enable <strong>Allow public client flows</strong>.
                </p>
              </div>

              <div>
                <p className="mb-2 font-medium text-foreground dark:text-foreground-night">
                  3. Create a client secret
                </p>
                <p className="text-muted-foreground dark:text-muted-foreground-night">
                  Under{" "}
                  <strong>Certificates & secrets → New client secret</strong>,
                  generate a secret and copy its <strong>Value</strong>{" "}
                  immediately — it won't be visible again.
                </p>
              </div>

              <div>
                <p className="mb-2 font-medium text-foreground dark:text-foreground-night">
                  4. Add API permissions
                </p>
                <p className="mb-2 text-muted-foreground dark:text-muted-foreground-night">
                  Under <strong>API permissions</strong>, search for{" "}
                  <strong>Power BI Service</strong> and add these delegated
                  permissions, then grant admin consent:
                </p>
                <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs dark:bg-muted-night">
                  {
                    "Dataset.Read.All\nReport.Read.All\nDashboard.Read.All\nWorkspace.Read.All"
                  }
                </pre>
              </div>

              <div>
                <p className="mb-2 font-medium text-foreground dark:text-foreground-night">
                  5. Enable MCP in Power BI admin portal
                </p>
                <p className="text-muted-foreground dark:text-muted-foreground-night">
                  In <strong>app.fabric.microsoft.com</strong>, go to the admin
                  portal and enable:{" "}
                  <em>
                    "Users can use the Power BI Model Context Protocol server
                    endpoint (preview)"
                  </em>
                  .
                </p>
              </div>

              <div>
                <p className="mb-2 font-medium text-foreground dark:text-foreground-night">
                  6. Enter credentials below
                </p>
                <p className="mb-3 text-muted-foreground dark:text-muted-foreground-night">
                  Fill in the OAuth fields using the values below. Replace{" "}
                  <code className="rounded bg-muted px-1 dark:bg-muted-night">
                    {"{TENANT_ID}"}
                  </code>{" "}
                  with your <strong>Directory (tenant) ID</strong>.
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
                        Client ID
                      </td>
                      <td className="py-2">
                        Your Application (client) ID from step 1
                      </td>
                    </tr>
                    <tr className="border-b border-border/50 dark:border-border-night/50">
                      <td className="py-2 pr-4 font-medium text-foreground dark:text-foreground-night">
                        Client Secret
                      </td>
                      <td className="py-2">The secret Value from step 3</td>
                    </tr>
                    <tr className="border-b border-border/50 dark:border-border-night/50">
                      <td className="py-2 pr-4 font-medium text-foreground dark:text-foreground-night">
                        Authorization URL
                      </td>
                      <td className="py-2 font-mono">
                        https://login.microsoftonline.com/
                        {"{TENANT_ID}"}/oauth2/v2.0/authorize
                      </td>
                    </tr>
                    <tr className="border-b border-border/50 dark:border-border-night/50">
                      <td className="py-2 pr-4 font-medium text-foreground dark:text-foreground-night">
                        Token URL
                      </td>
                      <td className="py-2 font-mono">
                        https://login.microsoftonline.com/
                        {"{TENANT_ID}"}/oauth2/v2.0/token
                      </td>
                    </tr>
                    <tr>
                      <td className="pt-2 pr-4 font-medium text-foreground dark:text-foreground-night">
                        Scope
                      </td>
                      <td className="pt-2 font-mono">
                        https://analysis.windows.net/powerbi/api/.default
                        offline_access
                      </td>
                    </tr>
                  </tbody>
                </table>
                <p className="mt-3 text-muted-foreground dark:text-muted-foreground-night">
                  <strong>Important:</strong> the scope must use{" "}
                  <code className="rounded bg-muted px-1 dark:bg-muted-night">
                    analysis.windows.net
                  </code>
                  , not{" "}
                  <code className="rounded bg-muted px-1 dark:bg-muted-night">
                    api.fabric.microsoft.com
                  </code>
                  .
                </p>
                <p className="mt-2 text-muted-foreground dark:text-muted-foreground-night">
                  The{" "}
                  <code className="rounded bg-muted px-1 dark:bg-muted-night">
                    offline_access
                  </code>{" "}
                  scope allows Dust to automatically refresh the authentication
                  token in the background, so users don't have to
                  re-authenticate every time the token expires (typically after
                  one hour).
                </p>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
