import React, { FC, useEffect, useState } from "react";
import { Box, Text, Newline } from "ink";
import Spinner from "ink-spinner";
import { UserType, WorkspaceType } from "@dust-tt/client";
import AuthService from "../../utils/authService.js";
import { getDustClient } from "../../utils/dustClient.js";
import { ExtendedUserType } from "../../types.js";

const Status: FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [apiUserInfo, setApiUserInfo] = useState<ExtendedUserType | null>(null);
  const [selectedWorkspace, setSelectedWorkspace] =
    useState<WorkspaceType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      setIsLoading(true);

      const dustClient = await getDustClient();

      if (!dustClient) {
        setError("Not authenticated.");
        return;
      }

      const meResponse = await dustClient.me();

      if (meResponse.isOk()) {
        // Get the selected workspace
        const workspaceId = await AuthService.getSelectedWorkspaceId();
        if (workspaceId) {
          const workspace = meResponse.value.workspaces.find(
            (w: WorkspaceType) => w.sId === workspaceId
          );
          if (workspace) {
            setSelectedWorkspace(workspace);
          }
        }

        setApiUserInfo(meResponse.value);
      } else {
        setError(`API error: ${meResponse.error.message}`);
      }

      setIsLoading(false);
    };

    checkAuth();
  }, []);

  if (isLoading) {
    return (
      <Box>
        <Text color="green">
          <Spinner type="dots" />
        </Text>
        <Text> Checking authentication status...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">⚠️ Error: {error}</Text>
        <Box marginTop={1}>
          <Text>Try running </Text>
          <Text color="green">dust auth --force</Text>
          <Text> to force a new authentication.</Text>
        </Box>
      </Box>
    );
  }

  if (!apiUserInfo) {
    return (
      <Box flexDirection="column">
        <Text color="yellow">Not authenticated</Text>
        <Box marginTop={1}>
          <Text>Run </Text>
          <Text color="green">dust auth</Text>
          <Text> to authenticate.</Text>
        </Box>
      </Box>
    );
  }

  if (!selectedWorkspace) {
    return (
      <Box flexDirection="column">
        <Text color="yellow">No workspace selected</Text>
        <Box marginTop={1}>
          <Text>Run </Text>
          <Text color="green">dust auth</Text>
          <Text> to select a workspace.</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color="green">✓ Authenticated</Text>

      <Box marginTop={1}>
        <Text>User: </Text>
        <Text bold>
          {apiUserInfo.fullName} ({apiUserInfo.email})
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text>Workspace: </Text>
        <Text bold color="cyan">
          {selectedWorkspace.name}
        </Text>
        <Text> (role: </Text>
        <Text color="green">{selectedWorkspace.role}</Text>
        <Text>)</Text>
      </Box>
    </Box>
  );
};

export default Status;
