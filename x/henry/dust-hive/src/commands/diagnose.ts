import { join } from "node:path";
import { logger } from "../lib/logger";
import { Ok, type Result } from "../lib/result";

// Inline diagnostic logic (no external script dependency)
async function runDiagnostics(): Promise<void> {
  console.log("==========================================");
  console.log("Zellij Session Diagnostics");
  console.log("==========================================");
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log("");

  // Zellij version
  console.log("=== Zellij Version ===");
  try {
    const proc = Bun.spawn(["zellij", "--version"], { stdout: "pipe", stderr: "pipe" });
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    console.log(output.trim() || "Unknown");
  } catch {
    console.log("Zellij not found");
  }
  console.log("");

  // List sessions
  console.log("=== Active Zellij Sessions ===");
  try {
    const proc = Bun.spawn(["zellij", "list-sessions"], { stdout: "pipe", stderr: "pipe" });
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    console.log(output.trim() || "No sessions");
  } catch {
    console.log("Could not list sessions");
  }
  console.log("");

  // Find Zellij processes and their resource usage
  console.log("=== Zellij Processes ===");
  try {
    const proc = Bun.spawn(
      ["bash", "-c", "pgrep -f zellij | xargs -I {} ps -p {} -o pid,ppid,%cpu,%mem,rss,vsz,etime,command 2>/dev/null"],
      { stdout: "pipe", stderr: "pipe" }
    );
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    if (output.trim()) {
      console.log(output.trim());

      // Check for high memory usage
      const lines = output.trim().split("\n");
      for (const line of lines.slice(1)) {
        // Skip header
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5) {
          const rssKb = parseInt(parts[4], 10);
          if (!isNaN(rssKb) && rssKb > 500000) {
            // > 500MB
            console.log(`\n⚠️  HIGH MEMORY: PID ${parts[0]} using ${Math.round(rssKb / 1024)}MB RSS`);
          }
        }
      }
    } else {
      console.log("No Zellij processes found");
    }
  } catch {
    console.log("Could not inspect processes");
  }
  console.log("");

  // File descriptors for Zellij processes
  console.log("=== File Descriptors ===");
  try {
    const proc = Bun.spawn(
      ["bash", "-c", `for pid in $(pgrep -f zellij 2>/dev/null); do echo "PID $pid: $(ls /proc/$pid/fd 2>/dev/null | wc -l) FDs"; done`],
      { stdout: "pipe", stderr: "pipe" }
    );
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    if (output.trim()) {
      console.log(output.trim());

      // Check for high FD count
      const lines = output.trim().split("\n");
      for (const line of lines) {
        const match = line.match(/PID (\d+): (\d+) FDs/);
        if (match) {
          const fdCount = parseInt(match[2], 10);
          if (fdCount > 100) {
            console.log(`⚠️  HIGH FD COUNT: PID ${match[1]} has ${fdCount} file descriptors`);
          }
        }
      }
    } else {
      console.log("No FD info available");
    }
  } catch {
    console.log("Could not get FD info");
  }
  console.log("");

  // Watch script processes
  console.log("=== Watch Script Processes ===");
  try {
    const proc = Bun.spawn(
      ["bash", "-c", "pgrep -cf 'watch-logs.sh' 2>/dev/null || echo 0"],
      { stdout: "pipe", stderr: "pipe" }
    );
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    const count = parseInt(output.trim(), 10) || 0;
    console.log(`Active watch-logs.sh instances: ${count}`);
    if (count > 10) {
      console.log(`⚠️  Many watch scripts running - possible accumulation`);
    }
  } catch {
    console.log("Could not count watch scripts");
  }
  console.log("");

  // Tail processes
  console.log("=== Tail Processes ===");
  try {
    const proc = Bun.spawn(
      ["bash", "-c", "pgrep -cf 'tail.*-F' 2>/dev/null || echo 0"],
      { stdout: "pipe", stderr: "pipe" }
    );
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    const count = parseInt(output.trim(), 10) || 0;
    console.log(`Active tail -F instances: ${count}`);
  } catch {
    console.log("Could not count tail processes");
  }
  console.log("");

  // Log file sizes
  const HOME = process.env["HOME"] ?? "";
  console.log("=== Log File Sizes ===");
  try {
    const envsDir = join(HOME, ".dust-hive", "envs");
    const proc = Bun.spawn(
      ["bash", "-c", `find "${envsDir}" -name "*.log" -exec ls -lh {} \\; 2>/dev/null | awk '{print $5, $9}'`],
      { stdout: "pipe", stderr: "pipe" }
    );
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    if (output.trim()) {
      console.log(output.trim());

      // Check for large files
      const lines = output.trim().split("\n");
      for (const line of lines) {
        const parts = line.split(/\s+/);
        if (parts[0] && (parts[0].includes("M") || parts[0].includes("G"))) {
          const sizeStr = parts[0];
          const size = parseFloat(sizeStr);
          if ((sizeStr.includes("M") && size > 100) || sizeStr.includes("G")) {
            console.log(`⚠️  LARGE LOG: ${parts[1]} is ${sizeStr}`);
          }
        }
      }
    } else {
      console.log("No log files found");
    }
  } catch {
    console.log("Could not check log sizes");
  }
  console.log("");

  // Temporal log
  console.log("=== Temporal Log ===");
  try {
    const temporalLog = join(HOME, ".dust-hive", "temporal.log");
    const proc = Bun.spawn(["ls", "-lh", temporalLog], { stdout: "pipe", stderr: "pipe" });
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    console.log(output.trim() || "No temporal log");
  } catch {
    console.log("No temporal log found");
  }
  console.log("");

  // System memory
  console.log("=== System Memory ===");
  try {
    const proc = Bun.spawn(["free", "-h"], { stdout: "pipe", stderr: "pipe" });
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    if (output.trim()) {
      console.log(output.trim());
    } else {
      // macOS fallback
      const macProc = Bun.spawn(["vm_stat"], { stdout: "pipe", stderr: "pipe" });
      const macOutput = await new Response(macProc.stdout).text();
      await macProc.exited;
      console.log(macOutput.trim() || "Memory info unavailable");
    }
  } catch {
    console.log("Memory info unavailable");
  }
  console.log("");

  // Docker containers
  console.log("=== Docker Containers ===");
  try {
    const proc = Bun.spawn(
      ["docker", "stats", "--no-stream", "--format", "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}"],
      { stdout: "pipe", stderr: "pipe" }
    );
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    // Filter for dust-related containers
    const lines = output.trim().split("\n");
    const relevant = lines.filter((l) => l.includes("dust") || l.includes("NAME"));
    console.log(relevant.join("\n") || "No dust containers");
  } catch {
    console.log("Docker not available");
  }
  console.log("");

  // PTY count
  console.log("=== PTY Allocation ===");
  try {
    const proc = Bun.spawn(["bash", "-c", "ls /dev/pts/ 2>/dev/null | wc -l"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    const count = parseInt(output.trim(), 10) || 0;
    console.log(`Active PTYs: ${count}`);
    if (count > 50) {
      console.log(`⚠️  Many PTYs allocated - possible leak`);
    }
  } catch {
    console.log("PTY info unavailable");
  }
  console.log("");

  // Zellij cache size
  console.log("=== Zellij State/Cache ===");
  try {
    const cacheDir = join(HOME, ".cache", "zellij");
    const dataDir = join(HOME, ".local", "share", "zellij");

    const cacheProc = Bun.spawn(["du", "-sh", cacheDir], { stdout: "pipe", stderr: "pipe" });
    const cacheOutput = await new Response(cacheProc.stdout).text();
    await cacheProc.exited;
    if (cacheOutput.trim()) {
      console.log(`Cache: ${cacheOutput.trim()}`);
    }

    const dataProc = Bun.spawn(["du", "-sh", dataDir], { stdout: "pipe", stderr: "pipe" });
    const dataOutput = await new Response(dataProc.stdout).text();
    await dataProc.exited;
    if (dataOutput.trim()) {
      console.log(`Data: ${dataOutput.trim()}`);
    }
  } catch {
    console.log("Cache info unavailable");
  }
  console.log("");

  // Log output rate (check if logs are being written rapidly)
  console.log("=== Log Output Rate (5 second sample) ===");
  try {
    const envsDir = join(HOME, ".dust-hive", "envs");
    // Get initial sizes
    const initialProc = Bun.spawn(
      ["bash", "-c", `find "${envsDir}" -name "*.log" -exec stat --format="%s %n" {} \\; 2>/dev/null || find "${envsDir}" -name "*.log" -exec stat -f "%z %N" {} \\; 2>/dev/null`],
      { stdout: "pipe", stderr: "pipe" }
    );
    const initialOutput = await new Response(initialProc.stdout).text();
    await initialProc.exited;

    // Wait 5 seconds
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Get final sizes
    const finalProc = Bun.spawn(
      ["bash", "-c", `find "${envsDir}" -name "*.log" -exec stat --format="%s %n" {} \\; 2>/dev/null || find "${envsDir}" -name "*.log" -exec stat -f "%z %N" {} \\; 2>/dev/null`],
      { stdout: "pipe", stderr: "pipe" }
    );
    const finalOutput = await new Response(finalProc.stdout).text();
    await finalProc.exited;

    // Parse and compare
    const parseOutput = (output: string): Map<string, number> => {
      const map = new Map<string, number>();
      for (const line of output.trim().split("\n")) {
        if (!line) continue;
        const parts = line.split(" ");
        if (parts.length >= 2) {
          const size = parseInt(parts[0], 10);
          const file = parts.slice(1).join(" ");
          if (!isNaN(size)) {
            map.set(file, size);
          }
        }
      }
      return map;
    };

    const initial = parseOutput(initialOutput);
    const final = parseOutput(finalOutput);

    let hasHighRate = false;
    for (const [file, finalSize] of final) {
      const initialSize = initial.get(file) ?? finalSize;
      const bytesPerSec = (finalSize - initialSize) / 5;
      if (bytesPerSec > 1000) {
        // > 1KB/s
        const kbPerSec = (bytesPerSec / 1024).toFixed(1);
        console.log(`${file.split("/").pop()}: ${kbPerSec} KB/s`);
        hasHighRate = true;
        if (bytesPerSec > 100000) {
          // > 100KB/s
          console.log(`⚠️  HIGH OUTPUT RATE - this can cause rendering lag`);
        }
      }
    }
    if (!hasHighRate) {
      console.log("Log output rate is low (< 1KB/s)");
    }
  } catch {
    console.log("Could not measure log output rate");
  }
  console.log("");

  // Check bash subprocesses that might be accumulating
  console.log("=== Bash Subprocesses ===");
  try {
    const proc = Bun.spawn(
      ["bash", "-c", "pgrep -f 'bash.*watch-logs\\|bash.*-c.*tail' 2>/dev/null | wc -l"],
      { stdout: "pipe", stderr: "pipe" }
    );
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    const count = parseInt(output.trim(), 10) || 0;
    console.log(`Bash subprocesses (watch/tail related): ${count}`);
    if (count > 20) {
      console.log(`⚠️  Many bash subprocesses - possible accumulation`);
    }
  } catch {
    console.log("Could not count bash subprocesses");
  }
  console.log("");

  // Check for zombie processes
  console.log("=== Zombie Processes ===");
  try {
    const proc = Bun.spawn(
      ["bash", "-c", "ps aux | grep -E '^[^ ]+ +[0-9]+ .* Z' | grep -c '' || echo 0"],
      { stdout: "pipe", stderr: "pipe" }
    );
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    const count = parseInt(output.trim(), 10) || 0;
    console.log(`Zombie processes: ${count}`);
    if (count > 5) {
      console.log(`⚠️  Zombie processes detected - parent not reaping children`);
    }
  } catch {
    console.log("Could not check for zombies");
  }
  console.log("");

  // Terminal emulator info
  console.log("=== Terminal Environment ===");
  console.log(`TERM: ${process.env["TERM"] ?? "unknown"}`);
  console.log(`TERM_PROGRAM: ${process.env["TERM_PROGRAM"] ?? "unknown"}`);
  console.log(`COLORTERM: ${process.env["COLORTERM"] ?? "unknown"}`);
  console.log(`ZELLIJ: ${process.env["ZELLIJ"] ?? "not in zellij"}`);
  console.log(`ZELLIJ_SESSION_NAME: ${process.env["ZELLIJ_SESSION_NAME"] ?? "N/A"}`);
  console.log("");

  // Check current session pane count
  if (process.env["ZELLIJ"]) {
    console.log("=== Current Session Info ===");
    try {
      // Try to get session info via zellij action
      const proc = Bun.spawn(["zellij", "action", "query-tab-names"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const output = await new Response(proc.stdout).text();
      await proc.exited;
      if (output.trim()) {
        const tabs = output.trim().split("\n");
        console.log(`Active tabs: ${tabs.length}`);
        console.log(`Tab names: ${tabs.join(", ")}`);
      }
    } catch {
      console.log("Could not query session info");
    }
    console.log("");
  }
}

function printRecommendations(): void {
  console.log("==========================================");
  console.log("Recommendations");
  console.log("==========================================");
  console.log("");
  console.log("If you see HIGH OUTPUT RATE warnings:");
  console.log("  → Services are logging too much, overwhelming the terminal");
  console.log("  → Fix: Reduce log verbosity or restart noisy services");
  console.log("  → Fix: dust-hive restart <env> <service>");
  console.log("");
  console.log("If you see HIGH MEMORY warnings:");
  console.log("  → Scrollback/state accumulation");
  console.log("  → Fix: dust-hive reload <env>");
  console.log("");
  console.log("If file descriptor count is high (> 100):");
  console.log("  → Possible FD leak");
  console.log("  → Fix: dust-hive reload <env>");
  console.log("");
  console.log("If log files are large (> 100MB):");
  console.log("  → Truncate logs:");
  console.log('  → echo "" > ~/.dust-hive/envs/<env>/<service>.log');
  console.log("");
  console.log("If many bash subprocesses or zombies:");
  console.log("  → Process accumulation from watch-logs.sh");
  console.log("  → Fix: dust-hive reload <env>");
  console.log("");
  console.log("Terminal emulator tips:");
  console.log("  → GPU-accelerated terminals (Alacritty, Kitty, WezTerm) handle");
  console.log("    high-volume output better than software-rendered terminals");
  console.log("");
  console.log("General prevention:");
  console.log("  → Periodically reload long-running sessions (every few hours)");
  console.log("  → Use 'dust-hive cool <env>' when taking breaks");
  console.log("  → Keep services from logging at DEBUG level continuously");
  console.log("");
}

export async function diagnoseCommand(): Promise<Result<void>> {
  logger.info("Running Zellij diagnostics...\n");

  await runDiagnostics();
  printRecommendations();

  return Ok(undefined);
}
