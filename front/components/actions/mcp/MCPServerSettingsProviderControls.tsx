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

export function MCPServerSettingsActivationControl({
  owner,
  mcpServerView,
  provider,
  isLoading,
  setIsLoading,
}: ActivationControlProps) {
  if (provider === "snowflake") {
    return (
      <SnowflakeWorkspaceActivationControl
        owner={owner}
        mcpServerView={mcpServerView}
        isLoading={isLoading}
        setIsLoading={setIsLoading}
      />
    );
  }

  return (
    <DefaultWorkspaceActivationControl
      owner={owner}
      mcpServerView={mcpServerView}
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
      {connection.authType === "keypair" ? "Key-pair" : "OAuth"}
    </div>
  );
}

interface WorkspaceActivationControlProps {
  owner: LightWorkspaceType;
  mcpServerView: MCPServerViewType;
  isLoading: boolean;
  setIsLoading: (isLoading: boolean) => void;
}

function DefaultWorkspaceActivationControl({
  owner,
  mcpServerView,
  isLoading,
  setIsLoading,
}: WorkspaceActivationControlProps) {
  const [isConnectDialogOpen, setIsConnectDialogOpen] = useState(false);

  return (
    <>
      <ConnectMCPServerDialog
        owner={owner}
        mcpServerView={mcpServerView}
        setIsLoading={setIsLoading}
        isOpen={isConnectDialogOpen}
        setIsOpen={setIsConnectDialogOpen}
      />
      <Button
        label="Activate"
        icon={LoginIcon}
        variant="primary"
        onClick={() => setIsConnectDialogOpen(true)}
        disabled={isLoading}
        isLoading={isLoading}
      />
    </>
  );
}

function SnowflakeWorkspaceActivationControl({
  owner,
  mcpServerView,
  isLoading,
  setIsLoading,
}: WorkspaceActivationControlProps) {
  const [isKeypairDialogOpen, setIsKeypairDialogOpen] = useState(false);

  return (
    <>
      <ConnectSnowflakeMCPKeypairDialog
        owner={owner}
        mcpServerView={mcpServerView}
        setIsLoading={setIsLoading}
        isOpen={isKeypairDialogOpen}
        setIsOpen={setIsKeypairDialogOpen}
      />
      <Button
        label="Activate (Key-pair)"
        icon={LoginIcon}
        variant="primary"
        onClick={() => setIsKeypairDialogOpen(true)}
        disabled={isLoading}
        isLoading={isLoading}
      />
    </>
  );
}
