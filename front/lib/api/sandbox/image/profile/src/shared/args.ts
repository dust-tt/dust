import { type ParseArgsConfig, parseArgs } from "node:util";

import { normalizeError } from "@app/types/shared/utils/error_utils";

import { HELP_FLAGS } from "../constants";

export function wantsHelp(args: readonly string[]): boolean {
  return args.length === 1 && HELP_FLAGS.has(args[0] ?? "");
}

export function usageError(message: string, usage: string): never {
  throw new Error(
    `${message}\nUsage: ${usage}\nRun with --help for more information.`
  );
}

export function parseIntArg(
  rawValue: string,
  label: string,
  options?: { minimum?: number; maximum?: number }
): number {
  const value = Number.parseInt(rawValue, 10);

  if (Number.isNaN(value)) {
    throw new Error(
      `invalid value for ${label}: ${JSON.stringify(rawValue)} (expected integer)`
    );
  }

  if (options?.minimum !== undefined && value < options.minimum) {
    throw new Error(
      `invalid value for ${label}: ${value} (must be >= ${options.minimum})`
    );
  }

  if (options?.maximum !== undefined && value > options.maximum) {
    throw new Error(
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
    throw normalizeError(err);
  }
}
