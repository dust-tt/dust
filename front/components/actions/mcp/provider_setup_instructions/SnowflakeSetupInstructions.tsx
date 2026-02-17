import type { MCPOAuthUseCase } from "@app/types/oauth/lib";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@dust-tt/sparkle";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";

interface SnowflakeSetupInstructionsProps {
  useCase: MCPOAuthUseCase | null;
}

export function SnowflakeSetupInstructions({
  useCase,
}: SnowflakeSetupInstructionsProps) {
  const [isOpen, setIsOpen] = useState(false);

  const redirectUri = `${process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}/oauth/snowflake/finalize`;

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
            <span>Snowflake Custom OAuth Setup Guide</span>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-3 space-y-4 rounded-lg border border-border bg-background p-4 text-sm dark:border-border-night dark:bg-background-night">
            <p className="text-muted-foreground dark:text-muted-foreground-night">
              Before connecting, you need to create a Custom OAuth Security
              Integration in your Snowflake account. Run the following SQL
              commands as an <strong>ACCOUNTADMIN</strong>:
            </p>

            <div className="space-y-3">
              <div>
                <p className="mb-2 font-medium text-foreground dark:text-foreground-night">
                  1. Create the OAuth Security Integration:
                </p>
                <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs dark:bg-muted-night">
                  {`CREATE SECURITY INTEGRATION dust_oauth
  TYPE = OAUTH
  ENABLED = TRUE
  OAUTH_CLIENT = CUSTOM
  OAUTH_CLIENT_TYPE = 'CONFIDENTIAL'
  OAUTH_REDIRECT_URI = '${redirectUri}'
  OAUTH_ISSUE_REFRESH_TOKENS = TRUE
  OAUTH_REFRESH_TOKEN_VALIDITY = 7776000;`}
                </pre>
              </div>

              <div>
                <p className="mb-2 font-medium text-foreground dark:text-foreground-night">
                  2. Get the Client ID and Client Secret:
                </p>
                <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs dark:bg-muted-night">
                  {`SELECT SYSTEM$SHOW_OAUTH_CLIENT_SECRETS('DUST_OAUTH');`}
                </pre>
                <p className="mt-2 text-muted-foreground dark:text-muted-foreground-night">
                  This returns a JSON object with{" "}
                  <code className="rounded bg-muted px-1 dark:bg-muted-night">
                    OAUTH_CLIENT_ID
                  </code>{" "}
                  and{" "}
                  <code className="rounded bg-muted px-1 dark:bg-muted-night">
                    OAUTH_CLIENT_SECRET
                  </code>
                  . Copy these values into the form below.
                </p>
              </div>

              <div>
                <p className="mb-2 font-medium text-foreground dark:text-foreground-night">
                  3. (Optional) Grant the integration to specific roles:
                </p>
                <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs dark:bg-muted-night">
                  {`GRANT USAGE ON INTEGRATION dust_oauth TO ROLE <role_name>;`}
                </pre>
              </div>
            </div>

            <p className="text-muted-foreground dark:text-muted-foreground-night">
              <strong>Note:</strong> The warehouse you specify below will be
              used for all users.
              {useCase === "platform_actions"
                ? " The role will also be shared across all users."
                : " The default role can be overridden by individual users during their personal authentication."}
            </p>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
