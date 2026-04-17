import { HELP_FLAGS } from "../constants";
import { error } from "./errors";

export function wantsHelp(args: readonly string[]): boolean {
  return args.length === 1 && HELP_FLAGS.has(args[0] ?? "");
}

export function parseIntArg(
  rawValue: string,
  label: string,
  options?: { minimum?: number; maximum?: number }
): number {
  const value = Number.parseInt(rawValue, 10);

  if (Number.isNaN(value)) {
    error(
      `invalid value for ${label}: ${JSON.stringify(rawValue)} (expected integer)`
    );
  }

  if (options?.minimum !== undefined && value < options.minimum) {
    error(
      `invalid value for ${label}: ${value} (must be >= ${options.minimum})`
    );
  }

  if (options?.maximum !== undefined && value > options.maximum) {
    error(
      `invalid value for ${label}: ${value} (must be <= ${options.maximum})`
    );
  }

  return value;
}

export function parseNamedArgs(
  args: readonly string[],
  flags: readonly string[]
): {
  positional: string[];
  named: Record<string, string>;
} {
  const positional: string[] = [];
  const named: Record<string, string> = {};
  const flagSet = new Set(flags);

  for (let index = 0; index < args.length; ) {
    const arg = args[index] ?? "";

    if (arg === "--") {
      positional.push(...args.slice(index + 1));
      break;
    }

    if (!arg.startsWith("--")) {
      positional.push(arg);
      index += 1;
      continue;
    }

    const key = arg.slice(2);
    if (!flagSet.has(key)) {
      positional.push(arg);
      index += 1;
      continue;
    }

    const value = args[index + 1];
    if (value === undefined) {
      error(`--${key} requires a value`);
    }

    named[key] = value;
    index += 2;
  }

  return { positional, named };
}
