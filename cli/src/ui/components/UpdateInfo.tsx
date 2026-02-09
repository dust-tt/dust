import { Box, Text } from "ink";
import type { FC } from "react";
import React, { useEffect, useState } from "react";

import pkg from "../../../package.json" with { type: "json" };
import { checkForUpdates } from "../../utils/updateChecker.js";

const UpdateInfo: FC = () => {
  const [updateInfo, setUpdateInfo] = useState<{
    currentVersion: string;
    latestVersion: string;
  } | null>(null);

  useEffect(() => {
    const checkUpdates = async () => {
      const result = await checkForUpdates();
      if (result) {
        setUpdateInfo(result);
      }
    };

    void checkUpdates();
  }, []);

  if (!updateInfo) {
    return null;
  }

  return (
    <Box marginBottom={1}>
      <Text dimColor>
        Update available: {updateInfo.currentVersion} → {updateInfo.latestVersion}
        {" · "}
        <Text dimColor>npm install -g {pkg.name}@latest</Text>
      </Text>
    </Box>
  );
};

export default UpdateInfo;
