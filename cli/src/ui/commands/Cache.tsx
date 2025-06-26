import { Box, Text } from "ink";
import type { FC } from "react";
import React, { useEffect, useState } from "react";

import { CacheManager } from "../../utils/cacheUtils.js";

const Cache: FC = () => {
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    async function handleCacheCommand() {
      setStatus("Clearing cache...");
      try {
        await CacheManager.invalidateAll();
        setStatus("Cache cleared successfully.");
      } catch (error) {
        setStatus(`Error clearing cache: ${error}`);
      }
    }

    void handleCacheCommand();
  }, []);

  return (
    <Box>
      <Text color={status.includes("Error") ? "red" : "green"}>{status}</Text>
    </Box>
  );
};

export default Cache;
