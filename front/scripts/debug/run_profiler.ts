import config from "@app/lib/api/config";
import type { GetProfilerResponse } from "@app/lib/api/debug/profiler";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import { makeScript } from "@app/scripts/helpers";
import { normalizeError } from "@app/types/shared/utils/error_utils";

makeScript(
  {
    host: {
      type: "string",
      default: "localhost",
      describe:
        "Host of the server to profile. In a Kubernetes pod this must be " +
        "the pod name, since the server binds to HOSTNAME, not localhost.",
    },
    port: {
      type: "number",
      default: 3000,
      describe: "Port of the server to profile.",
    },
  },
  async ({ execute, host, port }) => {
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
        `http://${host}:${port}/api/debug/profiler?secret=${debugProfilerSecret}`
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
      console.error(
        "Error when running profiler",
        normalizeError(error).message
      );
      process.exit(1);
    }
  }
);
