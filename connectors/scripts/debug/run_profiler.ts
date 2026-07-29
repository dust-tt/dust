import type { GetProfilerResponse } from "@connectors/api/profiler";
import { apiConfig } from "@connectors/lib/api/config";
import { normalizeError } from "@connectors/types";
import { makeScript } from "scripts/helpers";

makeScript({}, async ({ execute }) => {
  if (!execute) {
    console.log("Use --execute to run the script");
    return;
  }

  const debugProfilerSecret = apiConfig.getProfilerSecret();
  if (!debugProfilerSecret) {
    throw new Error("Profiler secret is not set");
  }

  try {
    console.log("Starting profiling...");

    // eslint-disable-next-line no-restricted-globals
    const response = await fetch(
      `http://localhost:3002/profiler?secret=${debugProfilerSecret}`
    );

    if (!response.ok) {
      const error = await response.json();
      console.error(error);
      throw new Error(error.message);
    }

    const data: GetProfilerResponse = await response.json();
    if ("cpu" in data) {
      console.log("Profiling completed. Response:", JSON.stringify(data));

      const { cpu: cpuPath, heap: heapPath } = data;

      if (!cpuPath || !heapPath) {
        throw new Error("Failed to parse profile paths from response");
      }

      console.log(`CPU profile: ${cpuPath}`);
      console.log(`Heap profile: ${heapPath}`);

      // Output paths for the local script to parse.
      console.log("PROFILE_PATHS");
      console.log(`cpu:${cpuPath}`);
      console.log(`heap:${heapPath}`);
    }
  } catch (error) {
    console.error("Error when running profiler", normalizeError(error).message);
    process.exit(1);
  }
});
