import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@dust-tt/sparkle";
import { Trans } from "@lingui/react/macro";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";

const REDIRECT_URIS = [
  "https://app.dust.tt/oauth/mcp_static/finalize",
  "https://eu.dust.tt/oauth/mcp_static/finalize",
  "https://dust.tt/oauth/mcp_static/finalize",
];

const TENANT_ID_PLACEHOLDER = "{TENANT_ID}";

export function PowerBiSetupInstructions() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="w-full pt-4">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger hideChevron>
          <div className="flex w-full items-center gap-2 rounded-lg border border-border bg-muted/50 p-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted">
            {isOpen ? (
              <ChevronDownIcon className="h-4 w-4 shrink-0" />
            ) : (
              <ChevronRightIcon className="h-4 w-4 shrink-0" />
            )}
            <span>
              <Trans>Power BI OAuth setup guide</Trans>
            </span>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-3 space-y-4 rounded-lg border border-border bg-background p-4 text-sm">
            <p className="text-muted-foreground">
              <Trans>
                Before connecting, register an application in{" "}
                <strong>Microsoft Entra ID</strong> to obtain OAuth credentials.
                You need <strong>Microsoft Entra admin access</strong> and the{" "}
                <strong>MCP feature enabled</strong> in your Power BI admin
                portal.
              </Trans>
            </p>

            <div className="space-y-4">
              <div>
                <p className="mb-2 font-medium text-foreground">
                  <Trans>1. Register an app in Microsoft Entra</Trans>
                </p>
                <p className="text-muted-foreground">
                  <Trans>
                    Go to{" "}
                    <strong>
                      entra.microsoft.com → App registrations → New registration
                    </strong>
                    . Name it "Dust Power BI MCP", select{" "}
                    <strong>organizational directory only</strong>, and leave
                    the redirect URI blank for now. Note the{" "}
                    <strong>Application (client) ID</strong> and{" "}
                    <strong>Directory (tenant) ID</strong>.
                  </Trans>
                </p>
              </div>

              <div>
                <p className="mb-2 font-medium text-foreground">
                  <Trans>2. Configure authentication</Trans>
                </p>
                <p className="mb-2 text-muted-foreground">
                  <Trans>
                    In the <strong>Authentication</strong> section, add these
                    three redirect URIs:
                  </Trans>
                </p>
                <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
                  {REDIRECT_URIS.join("\n")}
                </pre>
                <p className="mt-2 text-muted-foreground">
                  <Trans>
                    Also enable <strong>Allow public client flows</strong>.
                  </Trans>
                </p>
              </div>

              <div>
                <p className="mb-2 font-medium text-foreground">
                  <Trans>3. Create a client secret</Trans>
                </p>
                <p className="text-muted-foreground">
                  <Trans>
                    Under{" "}
                    <strong>Certificates & secrets → New client secret</strong>,
                    generate a secret and copy its <strong>Value</strong>{" "}
                    immediately — it won't be visible again.
                  </Trans>
                </p>
              </div>

              <div>
                <p className="mb-2 font-medium text-foreground">
                  <Trans>4. Add API permissions</Trans>
                </p>
                <p className="mb-2 text-muted-foreground">
                  <Trans>
                    Under <strong>API permissions</strong>, search for{" "}
                    <strong>Power BI Service</strong> and add these delegated
                    permissions, then grant admin consent:
                  </Trans>
                </p>
                <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
                  {
                    "Dataset.Read.All\nReport.Read.All\nDashboard.Read.All\nWorkspace.Read.All"
                  }
                </pre>
              </div>

              <div>
                <p className="mb-2 font-medium text-foreground">
                  <Trans>5. Enable MCP in Power BI admin portal</Trans>
                </p>
                <p className="text-muted-foreground">
                  <Trans>
                    In <strong>app.fabric.microsoft.com</strong>, go to the
                    admin portal and enable:{" "}
                    <em>
                      "Users can use the Power BI Model Context Protocol server
                      endpoint (preview)"
                    </em>
                    .
                  </Trans>
                </p>
              </div>

              <div>
                <p className="mb-2 font-medium text-foreground">
                  <Trans>6. Enter credentials below</Trans>
                </p>
                <p className="mb-3 text-muted-foreground">
                  <Trans>
                    Fill in the OAuth fields using the values below. Replace{" "}
                    <code className="rounded bg-muted px-1">
                      {TENANT_ID_PLACEHOLDER}
                    </code>{" "}
                    with your <strong>Directory (tenant) ID</strong>.
                  </Trans>
                </p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="pb-2 pr-4 text-left font-medium text-foreground">
                        <Trans context="table column header">Field</Trans>
                      </th>
                      <th className="pb-2 text-left font-medium text-foreground">
                        <Trans context="table column header">Value</Trans>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    <tr className="border-b border-border/50">
                      <td className="py-2 pr-4 font-medium text-foreground">
                        <Trans>Client ID</Trans>
                      </td>
                      <td className="py-2">
                        <Trans>Your Application (client) ID from step 1</Trans>
                      </td>
                    </tr>
                    <tr className="border-b border-border/50">
                      <td className="py-2 pr-4 font-medium text-foreground">
                        <Trans>Client Secret</Trans>
                      </td>
                      <td className="py-2">
                        <Trans>The secret Value from step 3</Trans>
                      </td>
                    </tr>
                    <tr className="border-b border-border/50">
                      <td className="py-2 pr-4 font-medium text-foreground">
                        <Trans>Authorization URL</Trans>
                      </td>
                      <td className="py-2 font-mono">
                        https://login.microsoftonline.com/
                        {"{TENANT_ID}"}/oauth2/v2.0/authorize
                      </td>
                    </tr>
                    <tr className="border-b border-border/50">
                      <td className="py-2 pr-4 font-medium text-foreground">
                        <Trans>Token URL</Trans>
                      </td>
                      <td className="py-2 font-mono">
                        https://login.microsoftonline.com/
                        {"{TENANT_ID}"}/oauth2/v2.0/token
                      </td>
                    </tr>
                    <tr>
                      <td className="pt-2 pr-4 font-medium text-foreground">
                        <Trans>Scope</Trans>
                      </td>
                      <td className="pt-2 font-mono">
                        https://analysis.windows.net/powerbi/api/.default
                        offline_access
                      </td>
                    </tr>
                  </tbody>
                </table>
                <p className="mt-3 text-muted-foreground">
                  <Trans>
                    <strong>Important:</strong> the scope must use{" "}
                    <code className="rounded bg-muted px-1">
                      analysis.windows.net
                    </code>
                    , not{" "}
                    <code className="rounded bg-muted px-1">
                      api.fabric.microsoft.com
                    </code>
                    .
                  </Trans>
                </p>
                <p className="mt-2 text-muted-foreground">
                  <Trans>
                    The{" "}
                    <code className="rounded bg-muted px-1">
                      offline_access
                    </code>{" "}
                    scope allows Dust to automatically refresh the
                    authentication token in the background, so users don't have
                    to re-authenticate every time the token expires (typically
                    after one hour).
                  </Trans>
                </p>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
