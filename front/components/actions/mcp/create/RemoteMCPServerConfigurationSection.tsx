import type { CreateMCPServerDialogFormValues } from "@app/components/actions/mcp/forms/types";
import type { DefaultRemoteMCPServerConfig } from "@app/lib/actions/mcp_internal_actions/remote_servers";
import type { AuthorizationInfo } from "@app/lib/actions/mcp_metadata_extraction";
import { useOAuthRedirectUri } from "@app/lib/swr/oauth";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Icon,
  InfoCircle,
  Input,
  Label,
  Tooltip,
} from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useController, useFormContext } from "react-hook-form";

type Translate = (descriptor: MessageDescriptor) => string;

function getBearerAuthMethodLabel(
  t: Translate,
  defaultServerConfig?: DefaultRemoteMCPServerConfig
): string {
  if (defaultServerConfig?.authMethod === "bearer") {
    const serverName = defaultServerConfig.name;
    return t(msg`${serverName} API key`);
  }
  return t(msg`Bearer token`);
}

function getAuthMethodLabel(
  authMethod: CreateMCPServerDialogFormValues["authMethod"],
  t: Translate,
  defaultServerConfig?: DefaultRemoteMCPServerConfig
): string {
  switch (authMethod) {
    case "oauth-dynamic":
      return t(msg`Automatic`);
    case "bearer":
      return getBearerAuthMethodLabel(t, defaultServerConfig);
    case "oauth-static":
      return t(msg`Static OAuth`);
  }
}

function getBearerPlaceholder(
  authMethod: CreateMCPServerDialogFormValues["authMethod"],
  t: Translate,
  defaultServerConfig?: DefaultRemoteMCPServerConfig
): string {
  if (defaultServerConfig?.authMethod === "bearer") {
    const serverName = defaultServerConfig.name;
    return t(msg`Paste your ${serverName} API key here`);
  }
  if (authMethod === "bearer") {
    return t(msg`Paste the bearer token here`);
  }
  return "";
}

interface RemoteMCPServerConfigurationSectionProps {
  workspaceId: string;
  isOpen: boolean;
  defaultServerConfig?: DefaultRemoteMCPServerConfig;
  // Callback to update authorization state in the parent dialog.
  // Authorization is workflow state (useState), not form state.
  onAuthorizationChange: (authorization: AuthorizationInfo | null) => void;
}

/**
 * @cc [owner:flvndvd,label:product] server-callback-instructions
 * All remote Static OAuth setup forms MUST display the server-advertised
 * callback. While loading or on failure, they MUST NOT substitute a URL
 * computed from browser configuration.
 */
export function RemoteMCPServerConfigurationSection({
  workspaceId,
  isOpen,
  defaultServerConfig,
  onAuthorizationChange,
}: RemoteMCPServerConfigurationSectionProps) {
  const { t } = useLingui();
  const {
    register,
    formState: { errors },
  } = useFormContext<CreateMCPServerDialogFormValues>();

  const { field: authMethodField } = useController<
    CreateMCPServerDialogFormValues,
    "authMethod"
  >({
    name: "authMethod",
  });

  const authMethod = authMethodField.value;

  const isStaticOAuth =
    authMethod === "oauth-static" ||
    defaultServerConfig?.authMethod === "oauth-static";
  const {
    redirectUri,
    isOAuthRedirectUriLoading,
    isOAuthRedirectUriError,
    mutateOAuthRedirectUri,
  } = useOAuthRedirectUri({
    workspaceId,
    provider: "mcp_static",
    disabled: !isOpen || !isStaticOAuth,
  });

  const authMethodLabel = getAuthMethodLabel(
    authMethod,
    t,
    defaultServerConfig
  );
  const presetName = defaultServerConfig?.name;

  return (
    <>
      {defaultServerConfig && (
        <div className="mb-4">
          <p className="text-sm text-muted-foreground">
            {defaultServerConfig.description}
            {defaultServerConfig.documentationUrl && (
              <>
                {" "}
                <a
                  href={defaultServerConfig.documentationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  <Trans>See {presetName} documentation.</Trans>
                </a>
              </>
            )}
          </p>
          {defaultServerConfig.connectionInstructions && (
            <p className="mt-2 text-sm text-muted-foreground">
              {defaultServerConfig.connectionInstructions}
            </p>
          )}
        </div>
      )}

      {!defaultServerConfig?.url && !defaultServerConfig?.hostDerivedOAuth && (
        <div className="space-y-2">
          <Label htmlFor="url">
            <Trans>URL</Trans>
          </Label>
          <div className="flex space-x-2">
            <div className="flex-grow">
              <Input
                id="url"
                placeholder="https://example.com/api/mcp"
                {...register("remoteServerUrl")}
                isError={!!errors.remoteServerUrl}
                message={errors.remoteServerUrl?.message}
                autoFocus
              />
            </div>
          </div>
        </div>
      )}

      {(!defaultServerConfig ||
        defaultServerConfig?.authMethod === "bearer") && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Label>
                <Trans>Authentication</Trans>
              </Label>
              <Tooltip
                trigger={
                  <Icon
                    visual={InfoCircle}
                    size="xs"
                    className="text-muted-foreground"
                  />
                }
                label={t`Choose how to authenticate to the MCP server: Automatic discovery, Bearer token, or Static OAuth credentials.`}
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" isSelect label={authMethodLabel} />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuRadioGroup value={authMethod}>
                  {!defaultServerConfig && (
                    <DropdownMenuRadioItem
                      value="oauth-dynamic"
                      label={t`Automatic`}
                      onClick={() => {
                        authMethodField.onChange("oauth-dynamic");
                        onAuthorizationChange(null);
                      }}
                    />
                  )}
                  {(!defaultServerConfig ||
                    defaultServerConfig?.authMethod === "bearer") && (
                    <DropdownMenuRadioItem
                      value="bearer"
                      label={getBearerAuthMethodLabel(t, defaultServerConfig)}
                      onClick={() => {
                        authMethodField.onChange("bearer");
                        onAuthorizationChange(null);
                      }}
                    />
                  )}
                  {!defaultServerConfig && (
                    <DropdownMenuRadioItem
                      value="oauth-static"
                      label={t`Static OAuth`}
                      onClick={() => {
                        authMethodField.onChange("oauth-static");
                        onAuthorizationChange({
                          provider: "mcp_static",
                          supported_use_cases: [
                            "platform_actions",
                            "personal_actions",
                          ],
                        });
                      }}
                    />
                  )}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {(authMethod === "oauth-dynamic" ||
            defaultServerConfig?.authMethod === "oauth-dynamic") && (
            <div className="text-xs text-muted-foreground">
              <Trans>
                Dust will automatically discover if OAuth authentication is
                required. If OAuth is not needed, the server will be accessed
                without authentication. Otherwise, Dust will try to use dynamic
                client registration to get the OAuth credentials.
              </Trans>
            </div>
          )}
          {(authMethod === "bearer" ||
            defaultServerConfig?.authMethod === "bearer") && (
            <div className="flex-grow">
              <Input
                id="sharedSecret"
                placeholder={getBearerPlaceholder(
                  authMethod,
                  t,
                  defaultServerConfig
                )}
                disabled={authMethod !== "bearer"}
                {...register("sharedSecret")}
                isError={!!errors.sharedSecret}
                message={errors.sharedSecret?.message}
              />
            </div>
          )}
        </div>
      )}
      {isOpen && isStaticOAuth && (
        <div className="text-xs text-muted-foreground">
          {isOAuthRedirectUriError ? (
            <div role="alert" className="flex items-center gap-2">
              <Trans>Could not load the redirect URI.</Trans>
              <Button
                variant="ghost"
                size="xs"
                label={t`Retry`}
                onClick={() =>
                  void mutateOAuthRedirectUri(undefined, {
                    throwOnError: false,
                  })
                }
              />
            </div>
          ) : isOAuthRedirectUriLoading || !redirectUri ? (
            <span role="status">
              <Trans>Loading redirect URI…</Trans>
            </span>
          ) : (
            <Trans>
              In your OAuth app, allow this redirect URI:{" "}
              <strong className="break-all">{redirectUri}</strong>
            </Trans>
          )}
        </div>
      )}
    </>
  );
}
