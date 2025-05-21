import type { AgentConfigurationType } from "@dust-tt/types";
import { Box, Text } from "ink";
import type { Result } from "meow";
import type { FC } from "react";
import React, { useEffect, useState } from "react";

import { fetchAndCacheAgentConfigurations } from "../utils/dustClient.js";
import AgentsMCP from "./commands/AgentsMCP.js";
import Auth from "./commands/Auth.js";
import Chat from "./commands/Chat.js";
import Logout from "./commands/Logout.js";
import Status from "./commands/Status.js";
import Help from "./Help.js";

interface AppProps {
  cli: Result<{
    version: {
      type: "boolean";
      shortFlag: "v";
    };
    force: {
      type: "boolean";
      shortFlag: "f";
    };
    help: {
      type: "boolean";
      shortFlag: "h";
    };
    port: {
      type: "number";
      shortFlag: "p";
    };
    sId: {
      type: "string";
      shortFlag: "s";
      isMultiple: true;
    };
  }>;
}

const App: FC<AppProps> = ({ cli }) => {
  const { input, flags } = cli;
  const command = input[0] || "chat";

  const [agentConfigurations, setAgentConfigurations] = useState<
    AgentConfigurationType[] | null
  >(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isUsingCachedData, setIsUsingCachedData] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [initialLoadComplete, setInitialLoadComplete] =
    useState<boolean>(false);
  const [backgroundUpdateMessage, setBackgroundUpdateMessage] = useState<
    string | null
  >(null);

  useEffect(() => {
    const loadAgentConfigs = async () => {
      if (
        (command === "agents-mcp" || command === "chat") &&
        flags.sId &&
        flags.sId.length > 0
      ) {
        setIsLoading(true);
        setError(null);
        setIsUsingCachedData(false);
        setBackgroundUpdateMessage(null);

        // Initial fetch (potentially cached)
        const initialConfigs = await fetchAndCacheAgentConfigurations(true);

        if (initialConfigs) {
          // Check if these configs are actually from cache by trying to load from cache directly
          // This is a bit of a workaround as fetchAndCacheAgentConfigurations(true)
          // doesn't explicitly return whether cache was used.
          // A better approach would be for fetchAndCacheAgentConfigurations to return { data, fromCache }
          const purelyCachedConfigs =
            await fetchAndCacheAgentConfigurations(true); // This will hit cache if available
          const cacheActuallyUsed =
            !!purelyCachedConfigs &&
            JSON.stringify(initialConfigs) ===
              JSON.stringify(purelyCachedConfigs);

          if (cacheActuallyUsed) {
            setIsUsingCachedData(true);
            setBackgroundUpdateMessage(
              "Using cached configurations. Checking for updates..."
            );
          }
          setAgentConfigurations(initialConfigs);
          setInitialLoadComplete(true);
          setIsLoading(false);

          // Background fetch for updates if cache was (potentially) used
          if (cacheActuallyUsed) {
            const freshConfigs = await fetchAndCacheAgentConfigurations(false);
            if (freshConfigs) {
              if (
                JSON.stringify(freshConfigs) !==
                JSON.stringify(initialConfigs)
              ) {
                setAgentConfigurations(freshConfigs);
                setBackgroundUpdateMessage("Configurations updated.");
              } else {
                setBackgroundUpdateMessage(
                  "Cached configurations are up to date."
                );
              }
              setIsUsingCachedData(false); // Now using fresh or confirmed fresh
            } else {
              setBackgroundUpdateMessage(
                "Failed to fetch updated configurations."
              );
            }
          }
        } else {
          setError("Failed to load agent configurations.");
          setIsLoading(false);
          setInitialLoadComplete(true); // Allow command rendering to show error
        }
      } else if (command === "agents-mcp" || command === "chat") {
        // Commands that might need all agents if no sId is provided
        // For now, let's assume they need to fetch all non-cached.
        // Or, this logic could be moved to the components themselves if they can operate without initial configs.
        setIsLoading(true);
        setError(null);
        const configs = await fetchAndCacheAgentConfigurations(false);
        if (configs) {
          setAgentConfigurations(configs);
        } else {
          setError("Failed to load agent configurations.");
        }
        setIsLoading(false);
        setInitialLoadComplete(true);
      } else {
        // For commands not needing agent configs, or handling their own
        setIsLoading(false);
        setInitialLoadComplete(true);
      }
    };

    void loadAgentConfigs();
  }, [command, flags.sId]);

  if (flags.version) {
    return <Text>Dust CLI v{process.env.npm_package_version || "0.1.0"}</Text>;
  }

  if (flags.help) {
    return <Help />;
  }

  // Display global loading or error states before rendering commands
  if (isLoading && !initialLoadComplete) {
    return <Text>Loading agent configurations...</Text>;
  }

  if (error && !agentConfigurations) {
    // Show error only if we definitely don't have configs to pass down
    return (
      <Box flexDirection="column">
        <Text color="red">{error}</Text>
        {backgroundUpdateMessage && (
          <Text dimColor>{backgroundUpdateMessage}</Text>
        )}
      </Box>
    );
  }

  // Render status messages related to background updates
  const StatusMessages = () => (
    <>
      {isUsingCachedData && backgroundUpdateMessage && (
        <Text dimColor>{backgroundUpdateMessage}</Text>
      )}
      {!isUsingCachedData && backgroundUpdateMessage && (
        <Text color="green">{backgroundUpdateMessage}</Text>
      )}
    </>
  );

  switch (command) {
    case "login":
      return <Auth force={flags.force} />;
    case "status":
      return <Status />;
    case "logout":
      return <Logout />;
    case "agents-mcp":
      if (!initialLoadComplete && isLoading) {
        return <Text>Loading agent configurations for MCP...</Text>;
      }
      if (error && !agentConfigurations) {
        return <Text color="red">Error: {error}</Text>;
      }
      return (
        <>
          <StatusMessages />
          <AgentsMCP
            port={flags.port}
            sId={flags.sId} // Keep sId for filtering within AgentsMCP if needed, or it can derive from configs
            initialAgentConfigurations={agentConfigurations}
            isUsingCachedData={isUsingCachedData}
          />
        </>
      );
    case "chat":
      if (!initialLoadComplete && isLoading) {
        return <Text>Loading agent configuration for Chat...</Text>;
      }
      if (error && !agentConfigurations && flags.sId?.[0]) {
        return <Text color="red">Error: {error}</Text>;
      }
      // Chat expects a single agent config or null if sId is not found
      const targetSId = flags.sId?.[0];
      const selectedAgentConfig = targetSId
        ? agentConfigurations?.find((a) => a.sId === targetSId) || null
        : null; // Or handle cases where chat can select an agent

      if (targetSId && !selectedAgentConfig && initialLoadComplete && !error) {
        return (
          <Text color="red">
            Agent with sId "{targetSId}" not found.
          </Text>
        );
      }

      return (
        <>
          <StatusMessages />
          <Chat
            sId={targetSId} // Keep sId for potential direct use or identification
            initialAgentConfiguration={selectedAgentConfig}
            allAgentConfigurations={agentConfigurations} // For listing/selection if sId not provided
            isUsingCachedData={isUsingCachedData}
          />
        </>
      );
    case "help":
      return <Help />;
    default:
      return (
        <Box flexDirection="column">
          <Text color="red">Unknown command: {command}</Text>
          <Box marginTop={1}>
            <Help />
          </Box>
        </Box>
      );
  }
};

export default App;
