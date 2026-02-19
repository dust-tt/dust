import type { CreateMCPServerDialogFormValues } from "@app/components/actions/mcp/forms/types";
import type { DefaultRemoteMCPServerConfig } from "@app/lib/actions/mcp_internal_actions/remote_servers";
import type { AuthorizationInfo } from "@app/lib/actions/mcp_metadata_extraction";
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

function getAuthMethodLabel(
  authMethod: CreateMCPServerDialogFormValues["authMethod"],
  defaultServerConfig?: DefaultRemoteMCPServerConfig
): string {
  switch (authMethod) {
    case "oauth-dynamic":
      return "Automatic";
    case "bearer":
      if (defaultServerConfig?.authMethod === "bearer") {
        return `${defaultServerConfig.name} API Key`;
      }
      return "Bearer token";
    case "oauth-static":
      return "Static OAuth";
  }
}

function getBearerPlaceholder(
  authMethod: CreateMCPServerDialogFormValues["authMethod"],
  defaultServerConfig?: DefaultRemoteMCPServerConfig
): string {
  if (defaultServerConfig?.authMethod === "bearer") {
    return `Paste your ${defaultServerConfig.name} API key here`;
  }
  if (authMethod === "bearer") {
    return "Paste the Bearer Token here";
  }
  return "";
}

interface RemoteMCPServerConfigurationSectionProps {
  defaultServerConfig?: DefaultRemoteMCPServerConfig;
  // Callback to update authorization state in the parent dialog.
  // Authorization is workflow state (useState), not form state.
  onAuthorizationChange: (authorization: AuthorizationInfo | null) => void;
}

export function RemoteMCPServerConfigurationSection({
  defaultServerConfig,
  onAuthorizationChange,
}: RemoteMCPServerConfigurationSectionProps) {
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

  const authMethodLabel = getAuthMethodLabel(authMethod, defaultServerConfig);

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
                        onAuthorizationChange(null);
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
                        onAuthorizationChange(null);
                      }}
                    />
                  )}
                  {!defaultServerConfig && (
                    <DropdownMenuRadioItem
                      value="oauth-static"
                      label="Static OAuth"
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
                placeholder={getBearerPlaceholder(
                  authMethod,
                  defaultServerConfig
                )}
                disabled={authMethod !== "bearer"}
                {...register("sharedSecret")}
                isError={!!errors.sharedSecret}
                message={errors.sharedSecret?.message}
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
