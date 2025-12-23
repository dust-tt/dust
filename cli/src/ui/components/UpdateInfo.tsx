import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import type { FC } from "react";
import React, { useEffect, useState } from "react";

import pkg from "../../../package.json" with { type: "json" };
import { checkForUpdates } from "../../utils/updateChecker.js";

interface UpdateInfoProps {
  onComplete: () => void;
}

const UpdateInfo: FC<UpdateInfoProps> = ({ onComplete }) => {
  const [isChecking, setIsChecking] = useState(true);
  const [updateInfo, setUpdateInfo] = useState<{
    currentVersion: string;
    latestVersion: string;
  } | null>(null);
  const [waitingForInput, setWaitingForInput] = useState(false);

  // Handle user input - any key continues with current version
  useInput(
    () => {
      if (waitingForInput) {
        onComplete();
      }
    },
    { isActive: waitingForInput }
  );

  useEffect(() => {
    const checkUpdates = async () => {
      setIsChecking(true);

      const result = await checkForUpdates();

      if (result) {
        // Update available - show notification and wait for input
        setUpdateInfo(result);
        setWaitingForInput(true);
      } else {
        // No update available, continue with app
        onComplete();
      }
      setIsChecking(false);
    };

    void checkUpdates();
  }, [onComplete]);

  if (updateInfo) {
    return (
      <Box
        flexDirection="column"
        paddingY={1}
        borderStyle="round"
        borderColor="cyan"
      >
        <Box paddingX={2}>
          <Text color="cyan" bold>
            ⬆ Update Available
          </Text>
        </Box>

        <Box paddingX={2} marginY={1}>
          <Text>
            <Text color="yellow">{updateInfo.currentVersion}</Text>
            <Text color="dim"> → </Text>
            <Text color="green" bold>
              {updateInfo.latestVersion}
            </Text>
          </Text>
        </Box>

        <Box paddingX={2} marginBottom={1}>
          <Text color="dim">To update, run:</Text>
        </Box>

        <Box paddingX={2} paddingY={1} borderStyle="single" borderColor="green">
          <Text color="green" bold>
            npm install -g {pkg.name}@latest
          </Text>
        </Box>

        <Box paddingX={2} marginTop={1}>
          <Text color="dim" italic>
            Press any key to continue with current version...
          </Text>
        </Box>
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

export default UpdateInfo;
