// Simple logger with color support

const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
};

function colorize(color: keyof typeof COLORS, text: string): string {
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

// Timing data collection for performance analysis
const timings: { name: string; duration: number; start: number }[] = [];
let globalStartTime = 0;

export const logger = {
  // Start timing collection
  startTiming(): void {
    globalStartTime = Date.now();
    timings.length = 0;
  },

  // Record a timing
  recordTiming(name: string, startTime: number): void {
    const duration = Date.now() - startTime;
    const start = startTime - globalStartTime;
    timings.push({ name, duration, start });
  },

  // Print timing report
  printTimingReport(): void {
    if (timings.length === 0) return;
    console.log();
    console.log(colorize("magenta", "=== TIMING REPORT ==="));
    const sorted = [...timings].sort((a, b) => b.duration - a.duration);
    for (const t of sorted) {
      const pct =
        globalStartTime > 0
          ? ((t.duration / (Date.now() - globalStartTime)) * 100).toFixed(1)
          : "?";
      console.log(
        `  ${colorize("cyan", t.name.padEnd(40))} ${colorize("yellow", `${t.duration}ms`.padStart(8))} (${pct}%) @ +${t.start}ms`
      );
    }
    console.log(colorize("magenta", "====================="));
  },

  info(message: string): void {
    console.log(`${colorize("blue", "info")} ${message}`);
  },

  success(message: string): void {
    console.log(`${colorize("green", "ok")} ${message}`);
  },

  warn(message: string): void {
    console.log(`${colorize("yellow", "warn")} ${message}`);
  },

  error(message: string): void {
    console.error(`${colorize("red", "error")} ${message}`);
  },

  step(message: string): void {
    console.log(`${colorize("cyan", "→")} ${message}`);
  },

  dim(message: string): void {
    console.log(colorize("dim", message));
  },

  // For progress/status without newline
  progress(message: string): void {
    process.stdout.write(`\r${colorize("cyan", "→")} ${message}`);
  },

  // Clear current line
  clearLine(): void {
    process.stdout.write("\r\x1b[K");
  },

  // Newline after progress
  progressDone(): void {
    console.log();
  },
};
