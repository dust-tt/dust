import React, { FC, useState, useEffect } from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import SelectInput from "ink-select-input";
import { WorkspaceType } from "@dust-tt/client";
import { getDustClient } from "../../utils/dustClient.js";
import TokenStorage from "../../utils/tokenStorage.js";

interface ExtendedItem {
  label: string;
  value: string;
  workspace: WorkspaceType;
}

interface WorkspaceSelectorProps {
  onComplete?: () => void;
}

const WorkspaceSelector: FC<WorkspaceSelectorProps> = ({ onComplete }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [items, setItems] = useState<ExtendedItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchWorkspaces = async () => {
      try {
        setIsLoading(true);

        const client = await getDustClient();

        if (!client) {
          setError(
            "Failed to initialize the API client. Please authenticate first using `dust auth`."
          );
          setIsLoading(false);
          return;
        }

        // Fetch user information which includes workspaces
        const meResponse = await client.me();

        if (meResponse.isErr()) {
          setError(`Error fetching workspaces: ${meResponse.error.message}`);
          setIsLoading(false);
          return;
        }

        const userWorkspaces = meResponse.value.workspaces || [];

        if (userWorkspaces.length === 0) {
          setError(
            "You don't have any workspaces. Visit https://dust.tt to create a workspace."
          );
          setIsLoading(false);
          return;
        }

        const selectionItems = userWorkspaces.map((workspace) => ({
          label: `${workspace.name} (${workspace.role})`,
          value: workspace.sId,
          workspace,
        }));

        setItems(selectionItems);
        setIsLoading(false);
      } catch (err) {
        setError(
          `Failed to fetch workspaces: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
        setIsLoading(false);
      }
    };

    fetchWorkspaces();
  }, []);

  const handleSelect = async (item: any) => {
    const extendedItem = item as ExtendedItem;
    await TokenStorage.saveWorkspaceId(
      extendedItem.value,
      extendedItem.workspace.name
    );
    onComplete?.();
  };

  if (isLoading) {
    return (
      <Box>
        <Text color="green">
          <Spinner type="dots" />
        </Text>
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
        <Text bold>Please select a workspace:</Text>
      </Box>
      <SelectInput items={items} onSelect={handleSelect} />
    </Box>
  );
};

export default WorkspaceSelector;
