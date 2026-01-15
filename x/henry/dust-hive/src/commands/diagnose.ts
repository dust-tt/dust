import { getEnvironment, listEnvironments } from "../lib/environment";
import { logger } from "../lib/logger";
import { getLogPath, getPidPath } from "../lib/paths";
import { isProcessRunning, readPid } from "../lib/process";
import { Ok, type Result } from "../lib/result";
import { ALL_SERVICES, type ServiceName } from "../lib/services";
import { getTemporalPid } from "../lib/temporal-server";

interface ProcessInfo {
  name: string;
  pid: number | null;
  running: boolean;
  memoryKB: number | null;
  cpuPercent: number | null;
  fdCount: number | null;
  threads: number | null;
}

// Get detailed process info using /proc filesystem
async function getProcessInfo(name: string, pid: number | null): Promise<ProcessInfo> {
  const info: ProcessInfo = {
    name,
    pid,
    running: false,
    memoryKB: null,
    cpuPercent: null,
    fdCount: null,
    threads: null,
  };

  if (pid === null) {
    return info;
  }

  info.running = isProcessRunning(pid);
  if (!info.running) {
    return info;
  }

  try {
    // Get memory and thread count from /proc/[pid]/status
    const statusFile = Bun.file(`/proc/${pid}/status`);
    if (await statusFile.exists()) {
      const status = await statusFile.text();
      const vmRssMatch = status.match(/VmRSS:\s+(\d+)\s+kB/);
      if (vmRssMatch) {
        info.memoryKB = parseInt(vmRssMatch[1], 10);
      }
      const threadsMatch = status.match(/Threads:\s+(\d+)/);
      if (threadsMatch) {
        info.threads = parseInt(threadsMatch[1], 10);
      }
    }

    // Count open file descriptors
    const proc = Bun.spawn(["ls", "-1", `/proc/${pid}/fd`], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const fdOutput = await new Response(proc.stdout).text();
    await proc.exited;
    if (proc.exitCode === 0) {
      info.fdCount = fdOutput.trim().split("\n").filter((l) => l.length > 0).length;
    }
  } catch {
    // Ignore errors - process may have exited
  }

  return info;
}

// Get log file size
async function getLogSize(envName: string, service: ServiceName): Promise<number | null> {
  try {
    const logPath = getLogPath(envName, service);
    const file = Bun.file(logPath);
    if (await file.exists()) {
      const stat = await file.stat();
      return stat?.size ?? null;
    }
  } catch {
    // Ignore errors
  }
  return null;
}

// Format bytes as human readable
function formatBytes(bytes: number | null): string {
  if (bytes === null) return "N/A";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

export async function diagnoseCommand(envName?: string): Promise<Result<void>> {
  console.log();
  logger.info("=== dust-hive Diagnostics ===");
  console.log();

  // List all environments
  const envNames = envName ? [envName] : await listEnvironments();

  if (envNames.length === 0) {
    logger.info("No environments found.");
  }

  // Check Temporal
  logger.step("Temporal Server:");
  const temporalPid = await getTemporalPid();
  const temporalInfo = await getProcessInfo("temporal", temporalPid);
  if (temporalInfo.running) {
    console.log(`  PID: ${temporalInfo.pid}`);
    console.log(`  Memory: ${formatBytes(temporalInfo.memoryKB ? temporalInfo.memoryKB * 1024 : null)}`);
    console.log(`  File Descriptors: ${temporalInfo.fdCount ?? "N/A"}`);
    console.log(`  Threads: ${temporalInfo.threads ?? "N/A"}`);
  } else {
    console.log("  Not running");
  }
  console.log();

  // Check each environment
  for (const name of envNames) {
    const env = await getEnvironment(name);
    if (!env) continue;

    logger.step(`Environment: ${name}`);
    console.log();

    // Check each service
    for (const service of ALL_SERVICES) {
      const pid = await readPid(name, service);
      const info = await getProcessInfo(service, pid);
      const logSize = await getLogSize(name, service);

      if (info.running) {
        console.log(`  ${service}:`);
        console.log(`    PID: ${info.pid}`);
        console.log(`    Memory: ${formatBytes(info.memoryKB ? info.memoryKB * 1024 : null)}`);
        console.log(`    File Descriptors: ${info.fdCount ?? "N/A"}`);
        console.log(`    Threads: ${info.threads ?? "N/A"}`);
        console.log(`    Log Size: ${formatBytes(logSize)}`);

        // Warn on high values
        if (info.fdCount && info.fdCount > 1000) {
          logger.warn(`    ⚠️ High FD count!`);
        }
        if (info.memoryKB && info.memoryKB > 2 * 1024 * 1024) { // > 2GB
          logger.warn(`    ⚠️ High memory usage!`);
        }
        if (logSize && logSize > 50 * 1024 * 1024) { // > 50MB
          logger.warn(`    ⚠️ Large log file!`);
        }
      } else {
        console.log(`  ${service}: Not running`);
      }
    }
    console.log();
  }

  // Check system-wide resource usage
  logger.step("System Resources:");
  try {
    const loadAvgFile = Bun.file("/proc/loadavg");
    if (await loadAvgFile.exists()) {
      const loadAvg = await loadAvgFile.text();
      const parts = loadAvg.trim().split(" ");
      console.log(`  Load Average: ${parts[0]} ${parts[1]} ${parts[2]}`);
    }

    const meminfoFile = Bun.file("/proc/meminfo");
    if (await meminfoFile.exists()) {
      const meminfo = await meminfoFile.text();
      const totalMatch = meminfo.match(/MemTotal:\s+(\d+)\s+kB/);
      const availMatch = meminfo.match(/MemAvailable:\s+(\d+)\s+kB/);
      if (totalMatch && availMatch) {
        const totalGB = parseInt(totalMatch[1], 10) / (1024 * 1024);
        const availGB = parseInt(availMatch[1], 10) / (1024 * 1024);
        const usedPercent = ((totalGB - availGB) / totalGB * 100).toFixed(1);
        console.log(`  Memory: ${availGB.toFixed(1)}GB available / ${totalGB.toFixed(1)}GB total (${usedPercent}% used)`);
      }
    }
  } catch {
    console.log("  Unable to read system info");
  }

  console.log();
  logger.info("=== Recommendations ===");
  console.log();
  console.log("If you're experiencing input lag:");
  console.log("  1. Check if any service has high FD count (> 1000)");
  console.log("  2. Check if any service has high memory (> 2GB)");
  console.log("  3. Try stopping services one at a time:");
  console.log("     - dust-hive stop <env> connectors");
  console.log("     - dust-hive stop <env> front-workers");
  console.log("  4. Try restarting Temporal: dust-hive temporal restart");
  console.log();

  return Ok(undefined);
}
