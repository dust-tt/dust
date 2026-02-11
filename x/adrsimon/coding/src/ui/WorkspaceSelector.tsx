import type { LightWorkspaceType } from "@dust-tt/client";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import React, { useCallback, useEffect, useState } from "react";

import { getDustClient, resetDustClient } from "../utils/dustClient.js";
import TokenStorage from "../utils/tokenStorage.js";

interface WorkspaceSelectorProps {
  onComplete: () => void;
}

export function WorkspaceSelector({ onComplete }: WorkspaceSelectorProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [workspaces, setWorkspaces] = useState<LightWorkspaceType[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setIsLoading(true);

        const clientRes = await getDustClient();
        if (clientRes.isErr()) {
          setError(clientRes.error.message);
          return;
        }

        const client = clientRes.value;
        if (!client) {
          setError("Failed to initialize API client. Please authenticate first.");
          setIsLoading(false);
          return;
        }

        const meResponse = await client.me();
        if (meResponse.isErr()) {
          setError(`Error fetching workspaces: ${meResponse.error.message}`);
          setIsLoading(false);
          return;
        }

        const userWorkspaces = meResponse.value.workspaces || [];

        if (userWorkspaces.length === 0) {
          setError("You don't have any workspaces. Visit https://dust.tt to create one.");
          setIsLoading(false);
          return;
        }

        if (userWorkspaces.length === 1) {
          await TokenStorage.saveWorkspaceId(userWorkspaces[0].sId);
          resetDustClient();
          setIsLoading(false);
          onComplete();
          return;
        }

        setWorkspaces(userWorkspaces);
        setIsLoading(false);
      } catch (err) {
        setError(`Failed to fetch workspaces: ${err instanceof Error ? err.message : String(err)}`);
        setIsLoading(false);
      }
    })();
  }, [onComplete]);

  useInput(
    (input, key) => {
      if (workspaces.length === 0) {
        return;
      }

      if (key.upArrow) {
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setSelectedIndex((prev) => Math.min(workspaces.length - 1, prev + 1));
      } else if (key.return) {
        const selected = workspaces[selectedIndex];
        (async () => {
          await TokenStorage.saveWorkspaceId(selected.sId);
          resetDustClient();
          onComplete();
        })();
      }
    },
    { isActive: workspaces.length > 0 }
  );

  if (isLoading) {
    return (
      <Box>
        <Text color="green"><Spinner type="dots" /></Text>
        <Text> Loading your workspaces...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">Error: {error}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Select a workspace:</Text>
      </Box>
      {workspaces.map((ws, i) => (
        <Box key={ws.sId}>
          <Text color={i === selectedIndex ? "blue" : undefined}>
            {i === selectedIndex ? "> " : "  "}
            {ws.name} ({ws.role})
          </Text>
        </Box>
      ))}
    </Box>
  );
}
