import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import type { FC } from "react";
import React, { useEffect, useState } from "react";

import {
  autoUpdateIfAvailable,
  restartProcess,
} from "../../utils/autoUpdater.js";

interface AutoUpdaterProps {
  onComplete: () => void;
}

const AutoUpdater: FC<AutoUpdaterProps> = ({ onComplete }) => {
  const [isChecking, setIsChecking] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkAndUpdate = async () => {
      try {
        setIsChecking(true);

        const updateResult = await autoUpdateIfAvailable();

        if (updateResult.isErr()) {
          // Update check failed, but continue with app
          setError(updateResult.error.message);
          setIsChecking(false);
          setTimeout(onComplete, 2000); // Show error briefly then continue
          return;
        }

        if (updateResult.value) {
          // Update was performed, show updating state then restart
          setIsChecking(false);
          setIsUpdating(true);
          restartProcess(); // This never returns
        } else {
          // No update available, continue with app
          setIsChecking(false);
          onComplete();
        }
      } catch (err) {
        // Silently handle errors and continue
        setIsChecking(false);
        onComplete();
      }
    };

    void checkAndUpdate();
  }, [onComplete]);

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="yellow">⚠ Update check failed: {error}</Text>
        <Text>Continuing with current version...</Text>
      </Box>
    );
  }

  if (isUpdating) {
    return (
      <Box>
        <Text color="green">
          <Spinner type="dots" />
        </Text>
        <Text> Updating Dust CLI... Restarting...</Text>
      </Box>
    );
  }

  if (isChecking) {
    return (
      <Box>
        <Text color="green">
          <Spinner type="dots" />
        </Text>
        <Text> Checking for updates...</Text>
      </Box>
    );
  }

  return null;
};

export default AutoUpdater;
