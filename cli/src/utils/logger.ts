import fs from "fs";
import os from "os";
import path from "path";
import util from "util";

const LOG_DIR = path.join(os.homedir(), ".dust-cli", "logs");
const MAX_FILE_SIZE_BYTES = 1024 * 1024; // 1 MB.

let logStream: fs.WriteStream | null = null;
let inkCleanup: (() => void) | null = null;

function getCurrentLogPath(): string {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return path.join(LOG_DIR, `${date}.log`);
}

// If the log file exceeds 1 MB, keep only the last ~75% by dropping the
// oldest bytes from the front.
function trimIfNeeded(filePath: string): void {
  try {
    const { size } = fs.statSync(filePath);
    if (size >= MAX_FILE_SIZE_BYTES) {
      const buf = fs.readFileSync(filePath);
      const keepFrom = Math.floor(size * 0.25);
      // Advance to the next newline so we don't start mid-line.
      const nextNewline = buf.indexOf(0x0a, keepFrom);
      const start = nextNewline === -1 ? keepFrom : nextNewline + 1;
      fs.writeFileSync(filePath, buf.subarray(start));
    }
  } catch {
    // File may not exist yet.
  }
}

function write(level: string, source: string, args: unknown[]): void {
  if (!logStream) {
    return;
  }
  const time = new Date().toISOString().slice(11, 19); // HH:MM:SS
  const msg = util.format(...args);
  logStream.write(`[${time}] [${level}] [${source}] ${msg}\n`);
}

function writeRaw(msg: string): void {
  if (!logStream) {
    return;
  }
  const time = new Date().toISOString().slice(11, 19);
  logStream.write(
    `[${time}] [STDERR] [raw] ${msg}${msg.endsWith("\n") ? "" : "\n"}`
  );
}

/**
 * Register Ink's cleanup function so the logger can restore the terminal
 * on fatal crashes before exiting.
 */
export function registerInkCleanup(cleanup: () => void): void {
  inkCleanup = cleanup;
}

/**
 * Initialize the logging subsystem. Call once at startup.
 *
 * - Opens a daily log file at ~/.dust-cli/logs/YYYY-MM-DD.log
 * - Trims the oldest 25% when a file exceeds 1 MB
 * - Redirects console.* and process.stderr to the log file so library
 *   output doesn't corrupt the Ink UI
 * - Installs an uncaughtException handler that cleans up Ink before exiting
 */
export function initLogger(): void {
  fs.mkdirSync(LOG_DIR, { recursive: true });

  const logPath = getCurrentLogPath();
  trimIfNeeded(logPath);
  logStream = fs.createWriteStream(logPath, { flags: "a" });

  // Redirect console methods so library output goes to the log file
  // with source [cli] instead of corrupting the terminal.
  console.log = (...args: unknown[]) => write("INFO", "cli", args);
  console.info = (...args: unknown[]) => write("INFO", "cli", args);
  console.debug = (...args: unknown[]) => write("DEBUG", "cli", args);
  console.error = (...args: unknown[]) => write("ERROR", "cli", args);
  console.warn = (...args: unknown[]) => write("WARN", "cli", args);
  console.trace = (...args: unknown[]) => write("TRACE", "cli", args);

  // Intercept process.stderr.write to catch libraries that bypass console
  // (e.g. SDK internals, undici/fetch errors).
  const origStderrWrite = process.stderr.write.bind(process.stderr);
  const stderrInterceptor: typeof process.stderr.write = (
    chunk: Uint8Array | string,
    encodingOrCallback?: BufferEncoding | ((err?: Error) => void),
    callback?: (err?: Error) => void
  ): boolean => {
    const msg = typeof chunk === "string" ? chunk : chunk.toString();
    writeRaw(msg);
    const cb =
      typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
    if (cb) {
      cb();
    }
    return true;
  };
  process.stderr.write = stderrInterceptor;

  process.on("uncaughtException", (err) => {
    const fatal = `[FATAL] ${err.stack || err.message}\n`;
    logStream?.write(fatal);
    if (inkCleanup) {
      inkCleanup();
    }
    origStderrWrite(fatal);
    process.exit(1);
  });
}
