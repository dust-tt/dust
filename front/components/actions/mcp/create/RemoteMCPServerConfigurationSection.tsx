import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Icon,
  InformationCircleIcon,
  Input,
  Label,
  Tooltip,
} from "@dust-tt/sparkle";
import { useController, useFormContext } from "react-hook-form";

import type { CreateMCPServerDialogFormValues } from "@app/components/actions/mcp/types";
import type { DefaultRemoteMCPServerConfig } from "@app/lib/actions/mcp_internal_actions/remote_servers";
import type { AuthorizationInfo } from "@app/lib/actions/mcp_metadata_extraction";

interface RemoteMCPServerConfigurationSectionProps {
  defaultServerConfig?: DefaultRemoteMCPServerConfig;
  setAuthorization: (authorization: AuthorizationInfo | null) => void;
}

export function RemoteMCPServerConfigurationSection({
  defaultServerConfig,
  setAuthorization,
}: RemoteMCPServerConfigurationSectionProps) {
  const form = useFormContext<CreateMCPServerDialogFormValues>();

  const { field: remoteServerUrlField, fieldState: remoteServerUrlFieldState } =
    useController({
      control: form.control,
      name: "remoteServerUrl",
    });

  const { field: authMethodField } = useController({
    control: form.control,
    name: "authMethod",
  });

  const { field: sharedSecretField } = useController({
    control: form.control,
    name: "sharedSecret",
  });

  const { field: oauthFormValidField } = useController({
    control: form.control,
    name: "oauthFormValid",
  });

  const authMethod = authMethodField.value;
  const sharedSecret = sharedSecretField.value;
  const remoteServerUrlError = remoteServerUrlFieldState.error?.message;

  const authMethodLabel =
    authMethod === "oauth-dynamic"
      ? "Automatic"
      : authMethod === "bearer"
        ? defaultServerConfig?.authMethod === "bearer"
          ? `${defaultServerConfig.name} API Key`
          : "Bearer token"
        : "Static OAuth";

  return (
    <>
      {defaultServerConfig && (
        <div className="mb-4">
          <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            {defaultServerConfig.description}
            {defaultServerConfig.documentationUrl && (
              <>
                {" "}
                <a
                  href={defaultServerConfig.documentationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline dark:text-primary-night"
                >
                  See {defaultServerConfig.name} documentation.
                </a>
              </>
            )}
          </p>
          {defaultServerConfig.connectionInstructions && (
            <p className="mt-2 text-sm text-muted-foreground dark:text-muted-foreground-night">
              {defaultServerConfig.connectionInstructions}
            </p>
          )}
        </div>
      )}

      {!defaultServerConfig?.url && (
        <div className="space-y-2">
          <Label htmlFor="url">URL</Label>
          <div className="flex space-x-2">
            <div className="flex-grow">
              <Input
                id="url"
                placeholder="https://example.com/api/mcp"
                {...remoteServerUrlField}
                onChange={(e) => {
                  remoteServerUrlField.onChange(e);
                  form.clearErrors("remoteServerUrl");
                }}
                isError={!!remoteServerUrlError}
                message={remoteServerUrlError}
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
              <Label>Authentication</Label>
              <Tooltip
                trigger={
                  <Icon
                    visual={InformationCircleIcon}
                    size="xs"
                    className="text-gray-400"
                  />
                }
                label="Choose how to authenticate to the MCP server: Automatic discovery, Bearer token, or Static OAuth credentials."
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
                      label="Automatic"
                      onClick={() => {
                        authMethodField.onChange("oauth-dynamic");
                        setAuthorization(null);
                        oauthFormValidField.onChange(true);
                      }}
                    />
                  )}
                  {(!defaultServerConfig ||
                    defaultServerConfig?.authMethod === "bearer") && (
                    <DropdownMenuRadioItem
                      value="bearer"
                      label={
                        defaultServerConfig?.authMethod === "bearer"
                          ? `${defaultServerConfig.name} API Key`
                          : "Bearer token"
                      }
                      onClick={() => {
                        authMethodField.onChange("bearer");
                        setAuthorization(null);
                        oauthFormValidField.onChange(true);
                      }}
                    />
                  )}
                  {!defaultServerConfig && (
                    <DropdownMenuRadioItem
                      value="oauth-static"
                      label="Static OAuth"
                      onClick={() => {
                        authMethodField.onChange("oauth-static");
                        setAuthorization({
                          provider: "mcp_static",
                          supported_use_cases: [
                            "platform_actions",
                            "personal_actions",
                          ],
                        });
                        oauthFormValidField.onChange(false);
                      }}
                    />
                  )}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {(authMethod === "oauth-dynamic" ||
            defaultServerConfig?.authMethod === "oauth-dynamic") && (
            <div className="text-xs text-muted-foreground dark:text-muted-foreground-night">
              Dust will automatically discover if OAuth authentication is
              required. If OAuth is not needed, the server will be accessed
              without authentication. Otherwise, Dust will try to use dynamic
              client registration to get the OAuth credentials.
            </div>
          )}
          {(authMethod === "bearer" ||
            defaultServerConfig?.authMethod === "bearer") && (
            <div className="flex-grow">
              <Input
                id="sharedSecret"
                placeholder={
                  defaultServerConfig?.authMethod === "bearer"
                    ? `Paste your ${defaultServerConfig.name} API key here`
                    : authMethod === "bearer"
                      ? "Paste the Bearer Token here"
                      : ""
                }
                disabled={authMethod !== "bearer"}
                {...sharedSecretField}
                value={sharedSecret ?? ""}
                onChange={(e) => {
                  const value = e.target.value;
                  sharedSecretField.onChange(value === "" ? undefined : value);
                }}
                isError={
                  defaultServerConfig?.authMethod === "bearer" && !sharedSecret
                }
              />
            </div>
          )}
          {!defaultServerConfig && authMethod === "oauth-static" && (
            <div className="text-xs text-muted-foreground dark:text-muted-foreground-night">
              The redirect URI to allow is{" "}
              <strong>{window.origin + "/oauth/mcp_static/finalize"}</strong>
            </div>
          )}
        </div>
      )}
    </>
  );
}
