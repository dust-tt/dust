import { Box, Text } from "ink";
import type { FC } from "react";
import React, { useEffect, useState } from "react";

import { CacheManager } from "../../utils/cacheUtils.js";

interface CacheProps {
  action?: "clear" | "stats";
}

const Cache: FC<CacheProps> = ({ action = "stats" }) => {
  const [status, setStatus] = useState<string>("");
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    async function handleCacheCommand() {
      if (action === "clear") {
        try {
          await CacheManager.invalidateAll();
          setStatus("Cache cleared successfully.");
        } catch (error) {
          setStatus(`Error clearing cache: ${error}`);
        }
      } else if (action === "stats") {
        try {
          const cacheStats = await CacheManager.getCacheStats();
          setStats(cacheStats);
        } catch (error) {
          setStatus(`Error getting cache stats: ${error}`);
        }
      }
    }

    void handleCacheCommand();
  }, [action]);

  if (action === "clear") {
    return (
      <Box>
        <Text color={status.includes("Error") ? "red" : "green"}>
          {status}
        </Text>
      </Box>
    );
  }

  if (stats) {
    return (
      <Box flexDirection="column">
        <Text color="cyan">Agent Cache Status:</Text>
        <Text>Cache exists: {stats.exists ? "Yes" : "No"}</Text>
        {stats.exists && (
          <>
            <Text>Workspace ID: {stats.workspaceId}</Text>
            <Text>Agent count: {stats.agentCount}</Text>
            <Text>Age: {Math.round(stats.age / 1000)}s</Text>
            <Text>
              Status: {stats.isExpired ? "Expired" : "Valid"}
            </Text>
          </>
        )}
      </Box>
    );
  }

  return (
    <Box>
      <Text>{status}</Text>
    </Box>
  );
};

export default Cache;