import {
  Card,
  cn,
  Hoverable,
  Icon,
  Input,
  Label,
  PlanetIcon,
  Tooltip,
  UserIcon,
} from "@dust-tt/sparkle";
import { useEffect } from "react";
import { useController, useFormContext } from "react-hook-form";

import type { MCPServerOAuthFormValues } from "@app/components/actions/mcp/forms/types";
import type { AuthorizationInfo } from "@app/lib/actions/mcp_metadata_extraction";
import type { MCPOAuthUseCase } from "@app/types";

export const OAUTH_USE_CASE_TO_LABEL: Record<MCPOAuthUseCase, string> = {
  platform_actions: "Shared",
  personal_actions: "Individual",
};

export const OAUTH_USE_CASE_TO_DESCRIPTION: Record<MCPOAuthUseCase, string> = {
  platform_actions: "All members use the credentials you provide now.",
  personal_actions: "Each member connects their own account.",
};

interface MCPServerOauthConnexionProps {
  toolName: string;
  authorization: AuthorizationInfo;
  documentationUrl?: string;
}

export function MCPServerOAuthConnexion({
  toolName,
  authorization,
  documentationUrl,
}: MCPServerOauthConnexionProps) {
  const {
    register,
    formState: { errors },
  } = useFormContext<MCPServerOAuthFormValues>();

  const { field: useCaseField } = useController<
    MCPServerOAuthFormValues,
    "useCase"
  >({
    name: "useCase",
  });

  const useCase = useCaseField.value;

  // Auto-select use case on mount
  useEffect(() => {
    if (useCase) {
      return;
    }
    if (authorization.supported_use_cases.includes("personal_actions")) {
      useCaseField.onChange("personal_actions");
    } else if (authorization.supported_use_cases.length > 0) {
      useCaseField.onChange(authorization.supported_use_cases[0]);
    }
  }, [authorization.supported_use_cases, useCaseField, useCase]);

  const supportsPersonalActions =
    authorization.supported_use_cases.includes("personal_actions");
  const supportsPlatformActions =
    authorization.supported_use_cases.includes("platform_actions");
  const supportBoth = supportsPersonalActions && supportsPlatformActions;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-full space-y-4">
        <div className="heading-lg text-foreground dark:text-foreground-night">
          {supportBoth ? "How do you want to connect?" : "Connection type"}
        </div>
        <div className="grid w-full grid-cols-2 gap-4">
          <ConditionalTooltip
            showTooltip={!supportsPersonalActions}
            label={`${toolName} does not support individual connection.`}
          >
            <Card
              variant={supportsPersonalActions ? "secondary" : "primary"}
              selected={useCase === "personal_actions"}
              disabled={!supportsPersonalActions}
              className={cn(
                "h-full",
                supportsPersonalActions
                  ? "cursor-pointer"
                  : "cursor-not-allowed"
              )}
              onClick={
                supportsPersonalActions
                  ? () => useCaseField.onChange("personal_actions")
                  : undefined
              }
            >
              <div className="flex flex-col gap-1 p-1">
                <div className="flex items-center gap-2">
                  <Icon
                    visual={UserIcon}
                    className={cn(
                      supportsPersonalActions
                        ? "text-highlight"
                        : "text-muted-foreground dark:text-muted-foreground-night"
                    )}
                  />
                  <span
                    className={cn(
                      "font-medium",
                      supportsPersonalActions
                        ? "text-highlight"
                        : "text-muted-foreground dark:text-muted-foreground-night"
                    )}
                  >
                    {OAUTH_USE_CASE_TO_LABEL["personal_actions"]}
                  </span>
                </div>
                <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                  {OAUTH_USE_CASE_TO_DESCRIPTION["personal_actions"]}
                </span>
              </div>
            </Card>
          </ConditionalTooltip>
          <ConditionalTooltip
            showTooltip={!supportsPlatformActions}
            label={`${toolName} does not support shared connection.`}
          >
            <Card
              variant={supportsPlatformActions ? "secondary" : "primary"}
              selected={useCase === "platform_actions"}
              disabled={!supportsPlatformActions}
              className={cn(
                "h-full",
                supportsPlatformActions
                  ? "cursor-pointer"
                  : "cursor-not-allowed"
              )}
              onClick={
                supportsPlatformActions
                  ? () => useCaseField.onChange("platform_actions")
                  : undefined
              }
            >
              <div className="flex flex-col gap-1 p-1">
                <div className="flex items-center gap-2">
                  <Icon
                    visual={PlanetIcon}
                    className={cn(
                      supportsPlatformActions
                        ? "text-highlight"
                        : "text-muted-foreground dark:text-muted-foreground-night"
                    )}
                  />
                  <span
                    className={cn(
                      "font-medium",
                      supportsPlatformActions
                        ? "text-highlight"
                        : "text-muted-foreground dark:text-muted-foreground-night"
                    )}
                  >
                    {OAUTH_USE_CASE_TO_LABEL["platform_actions"]}
                  </span>
                </div>
                <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                  {OAUTH_USE_CASE_TO_DESCRIPTION["platform_actions"]}
                </span>
              </div>
            </Card>
          </ConditionalTooltip>
        </div>
      </div>

      {/* Static OAuth fields - only for mcp_static provider */}
      {authorization.provider === "mcp_static" && (
        <div className="w-full space-y-4 pt-4">
          <div className="space-y-1">
            <Label className="text-sm font-semibold text-foreground dark:text-foreground-night">
              Client ID
            </Label>
            <Input
              {...register("oauthCredentials.client_id")}
              placeholder="Enter your OAuth Client ID"
              isError={!!errors.oauthCredentials?.client_id}
              message={errors.oauthCredentials?.client_id?.message}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-sm font-semibold text-foreground dark:text-foreground-night">
              Client Secret (optional for PKCE)
            </Label>
            <Input
              {...register("oauthCredentials.client_secret")}
              placeholder="Enter your OAuth Client Secret"
              isError={!!errors.oauthCredentials?.client_secret}
              message={errors.oauthCredentials?.client_secret?.message}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-sm font-semibold text-foreground dark:text-foreground-night">
              Authorization Endpoint
            </Label>
            <Input
              {...register("oauthCredentials.authorization_endpoint")}
              placeholder="https://example.com/oauth/authorize"
              isError={!!errors.oauthCredentials?.authorization_endpoint}
              message={errors.oauthCredentials?.authorization_endpoint?.message}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-sm font-semibold text-foreground dark:text-foreground-night">
              Token Endpoint
            </Label>
            <Input
              {...register("oauthCredentials.token_endpoint")}
              placeholder="https://example.com/oauth/token"
              isError={!!errors.oauthCredentials?.token_endpoint}
              message={errors.oauthCredentials?.token_endpoint?.message}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-sm font-semibold text-foreground dark:text-foreground-night">
              Scope (space-separated)
            </Label>
            <Input
              {...register("oauthCredentials.scope")}
              placeholder="read write"
              isError={!!errors.oauthCredentials?.scope}
              message={errors.oauthCredentials?.scope?.message}
            />
          </div>
        </div>
      )}

      {/* Dynamic OAuth (mcp provider) - credentials obtained via OAuth flow */}
      {authorization.provider === "mcp" && (
        <div className="w-full pt-4 text-sm text-muted-foreground dark:text-muted-foreground-night">
          Credentials will be obtained automatically via the OAuth flow.
        </div>
      )}

      {documentationUrl && (
        <div className="w-full pt-6 text-sm text-muted-foreground dark:text-muted-foreground-night">
          Questions ? Read{" "}
          <Hoverable href={documentationUrl} target="_blank" variant="primary">
            our guide
          </Hoverable>{" "}
          on {toolName}.
        </div>
      )}
    </div>
  );
}

function ConditionalTooltip({
  showTooltip,
  label,
  children,
}: {
  showTooltip: boolean;
  label: string;
  children: React.ReactElement;
}) {
  if (showTooltip) {
    return <Tooltip label={label} trigger={children} tooltipTriggerAsChild />;
  }
  return children;
}
