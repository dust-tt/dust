import updateNotifier from "update-notifier";

import pkg from "../../package.json" with { type: "json" };

/**
 * Check for updates and notify user if available
 * Returns update info if available, null otherwise
 */
export async function checkForUpdates(): Promise<{
  currentVersion: string;
  latestVersion: string;
} | null> {
  // Skip update check in CI environments
  if (process.env.CI || process.env.NODE_ENV === "test") {
    return null;
  }

  const notifier = updateNotifier({ pkg });
  const updateInfo = await notifier.fetchInfo();

  if (updateInfo.latest === updateInfo.current) {
    return null;
  }

  return {
    currentVersion: updateInfo.current,
    latestVersion: updateInfo.latest,
  };
}
