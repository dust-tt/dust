import { type ParseArgsConfig, parseArgs } from "node:util";

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

export function parseToolArgs<
  T extends NonNullable<ParseArgsConfig["options"]>,
>(args: readonly string[], options: T) {
  try {
    return parseArgs({
      args: [...args],
      options,
      allowPositionals: true,
      strict: true,
    });
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
  }
}
