import config from "@app/lib/api/config";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import type { GetProfilerResponse } from "@app/pages/api/debug/profiler";
import { makeScript } from "@app/scripts/helpers";
import { normalizeError } from "@app/types";

makeScript({}, async ({ execute }) => {
  if (!execute) {
    return;
  }

  const debugProfilerSecret = config.getProfilerSecret();
  if (!debugProfilerSecret) {
    throw new Error("Profiler secret is not set");
  }

  try {
    console.log("Starting profiling...");

    // eslint-disable-next-line no-restricted-globals
    const response = await fetch(
      `http://localhost:3000/api/debug/profiler?secret=${debugProfilerSecret}`
    );

    if (!response.ok) {
      const error = await getErrorFromResponse(response);
      console.error(error);
      throw new Error(error.message);
    }

    const data: GetProfilerResponse = await response.json();
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
  } catch (error) {
    console.error("Error when running profiler", normalizeError(error).message);
    process.exit(1);
  }
});
