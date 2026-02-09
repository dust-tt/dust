import fs from "fs";
import os from "os";
import path from "path";
import util from "util";

export function initLogger(): void {
  const logDir = path.join(os.homedir(), ".dust-cli", "logs");
  fs.mkdirSync(logDir, { recursive: true });

  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const logPath = path.join(logDir, `${date}.log`);
  const stream = fs.createWriteStream(logPath, { flags: "a" });

  const write = (level: string, args: unknown[]) => {
    const time = new Date().toISOString().slice(11, 19); // HH:MM:SS
    const msg = util.format(...args);
    stream.write(`[${time}] [${level}] ${msg}\n`);
  };

  // Patch all console methods to redirect to log file.
  console.log = (...args: unknown[]) => write("INFO", args);
  console.info = (...args: unknown[]) => write("INFO", args);
  console.debug = (...args: unknown[]) => write("DEBUG", args);
  console.error = (...args: unknown[]) => write("ERROR", args);
  console.warn = (...args: unknown[]) => write("WARN", args);
  console.trace = (...args: unknown[]) => write("TRACE", args);

  // Intercept process.stderr.write to catch libraries that bypass console
  // (e.g. SDK internals, undici/fetch errors).
  const origStderrWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((
    chunk: Uint8Array | string,
    encodingOrCallback?: BufferEncoding | ((err?: Error) => void),
    callback?: (err?: Error) => void
  ): boolean => {
    const msg = typeof chunk === "string" ? chunk : chunk.toString();
    const time = new Date().toISOString().slice(11, 19);
    stream.write(`[${time}] [STDERR] ${msg}${msg.endsWith("\n") ? "" : "\n"}`);
    // Call the callback if provided so callers aren't left hanging.
    const cb =
      typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
    if (cb) {
      cb();
    }
    return true;
  }) as typeof process.stderr.write;

  // Keep original stderr for fatal crashes.
  process.on("uncaughtException", (err) => {
    origStderrWrite(`[FATAL] ${err.stack || err.message}\n`);
    process.exit(1);
  });
}
