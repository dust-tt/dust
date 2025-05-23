import { execSync } from "child_process";

import { makeScript } from "@app/scripts/helpers";

function execKubectl(command: string): string {
  try {
    return execSync(command, { encoding: "utf8" });
  } catch (error) {
    throw new Error(`kubectl command failed: ${command}\n${error}`);
  }
}

makeScript(
  {
    namespace: {
      type: "string",
      optional: true,
      default: "default",
    },
    podName: {
      type: "string",
    },
  },
  async ({ execute, podName, namespace }, logger) => {
    if (!execute) {
      return;
    }

    if (!podName) {
      throw new Error("Pod name is required");
    }

    logger.info(`Profiling pod ${podName}...`);

    try {
      const command = `kubectl exec -n ${namespace} ${podName} -- npm run debug:profiler`;
      const output = execKubectl(command);

      logger.info(`Profiling output: ${output}`);

      // Extract file paths from the output.
      const lines = output.split("\n");
      const pathsStartIndex = lines.findIndex((line) =>
        line.includes("PROFILE_PATHS")
      );

      if (pathsStartIndex === -1) {
        throw new Error("Could not find PROFILE_PATHS in output");
      }

      const cpuLine = lines.find((line) => line.startsWith("cpu:"));
      const heapLine = lines.find((line) => line.startsWith("heap:"));

      if (!cpuLine || !heapLine) {
        throw new Error("Could not extract profile paths");
      }

      const cpuPath = cpuLine.split(":").slice(1).join(":");
      const heapPath = heapLine.split(":").slice(1).join(":");

      // Generate local filenames with timestamp.
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const localCpu = `cpu-${podName}-${timestamp}.cpuprofile`;
      const localHeap = `heap-${podName}-${timestamp}.heapprofile`;

      // Copy files from pod.
      console.log("Copying profiles from pod...");
      execKubectl(`kubectl cp ${namespace}/${podName}:${cpuPath} ${localCpu}`);
      execKubectl(
        `kubectl cp ${namespace}/${podName}:${heapPath} ${localHeap}`
      );

      console.log("Profiles saved locally:");
      console.log(`  CPU:  ${localCpu}`);
      console.log(`  Heap: ${localHeap}`);
      console.log("");
      console.log("To analyze:");
      console.log(
        "  Chrome DevTools → Performance → Load Profile → select files"
      );
    } catch (err) {
      logger.error(err);
      throw err;
    }
  }
);
