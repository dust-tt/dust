import { ConnectMCPServerDialog } from "@app/components/actions/mcp/create/ConnectMCPServerDialog";
import { ConnectSnowflakeMCPKeypairDialog } from "@app/components/actions/mcp/create/ConnectSnowflakeMCPKeypairDialog";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { MCPServerConnectionType } from "@app/lib/resources/mcp_server_connection_resource";
import type { OAuthProvider } from "@app/types/oauth/lib";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, LoginIcon } from "@dust-tt/sparkle";
import { useState } from "react";

interface ActivationControlProps {
  owner: LightWorkspaceType;
  mcpServerView: MCPServerViewType;
  provider: OAuthProvider | undefined;
  isLoading: boolean;
  setIsLoading: (isLoading: boolean) => void;
}

export function MCPServerSettingsActivationControl({
  owner,
  mcpServerView,
  provider,
  isLoading,
  setIsLoading,
}: ActivationControlProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const DialogComponent =
    provider === "snowflake"
      ? ConnectSnowflakeMCPKeypairDialog
      : ConnectMCPServerDialog;
  const buttonLabel =
    provider === "snowflake" ? "Activate (Static credentials)" : "Activate";

  return (
    <>
      <DialogComponent
        owner={owner}
        mcpServerView={mcpServerView}
        setIsLoading={setIsLoading}
        isOpen={isDialogOpen}
        setIsOpen={setIsDialogOpen}
      />
      <Button
        label={buttonLabel}
        icon={LoginIcon}
        variant="primary"
        onClick={() => setIsDialogOpen(true)}
        disabled={isLoading}
        isLoading={isLoading}
      />
    </>
  );
}

interface CredentialDetailsProps {
  provider: OAuthProvider | undefined;
  connection: MCPServerConnectionType;
}

export function MCPServerSettingsCredentialDetails({
  provider,
  connection,
}: CredentialDetailsProps) {
  if (provider !== "snowflake") {
    return null;
  }

  return (
    <div className="w-full text-muted-foreground dark:text-muted-foreground-night">
      <span className="font-semibold">Auth type</span>:{" "}
      {connection.authType === "keypair" ? "Static credentials" : "OAuth"}
    </div>
  );
}
