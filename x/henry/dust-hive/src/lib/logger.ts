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

export const logger = {
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
