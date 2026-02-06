import { Button, LoginIcon } from "@dust-tt/sparkle";
import { useState } from "react";

import { ConnectMCPServerDialog } from "@app/components/actions/mcp/create/ConnectMCPServerDialog";
import { ConnectSnowflakeMCPKeypairDialog } from "@app/components/actions/mcp/create/ConnectSnowflakeMCPKeypairDialog";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { MCPServerConnectionType } from "@app/lib/resources/mcp_server_connection_resource";
import type { LightWorkspaceType, OAuthProvider } from "@app/types";

interface ActivationControlProps {
  owner: LightWorkspaceType;
  mcpServerView: MCPServerViewType;
  provider: OAuthProvider | undefined;
  isLoading: boolean;
  setIsLoading: (isLoading: boolean) => void;
}

interface WorkspaceActivationDialogProps {
  owner: LightWorkspaceType;
  mcpServerView: MCPServerViewType;
  setIsLoading: (isLoading: boolean) => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

export function MCPServerSettingsActivationControl({
  owner,
  mcpServerView,
  provider,
  isLoading,
  setIsLoading,
}: ActivationControlProps) {
  const config =
    provider === "snowflake"
      ? {
          dialog: ConnectSnowflakeMCPKeypairDialog,
          buttonLabel: "Activate (Static credentials)",
        }
      : {
          dialog: ConnectMCPServerDialog,
          buttonLabel: "Activate",
        };

  return (
    <WorkspaceActivationControl
      owner={owner}
      mcpServerView={mcpServerView}
      DialogComponent={config.dialog}
      buttonLabel={config.buttonLabel}
      isLoading={isLoading}
      setIsLoading={setIsLoading}
    />
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

interface WorkspaceActivationControlProps {
  owner: LightWorkspaceType;
  mcpServerView: MCPServerViewType;
  DialogComponent: (props: WorkspaceActivationDialogProps) => JSX.Element;
  buttonLabel: string;
  isLoading: boolean;
  setIsLoading: (isLoading: boolean) => void;
}

function WorkspaceActivationControl({
  owner,
  mcpServerView,
  DialogComponent,
  buttonLabel,
  isLoading,
  setIsLoading,
}: WorkspaceActivationControlProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

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
