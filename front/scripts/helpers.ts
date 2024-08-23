import type { LightWorkspaceType } from "@dust-tt/types";
import type { Options } from "yargs";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { Workspace } from "@app/lib/models/workspace";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import logger from "@app/logger/logger";

// Define a type for the argument specification object.
export type ArgumentSpecs = {
  [key: string]: Options & { type?: "array" | "string" | "boolean" | "number" };
};

// Define a type for the worker function.
type WorkerFunction<T> = (args: T, logger: Logger) => Promise<void>;

// Define a utility type to infer the argument types from the argument specs.
type InferArgs<T> = {
  [P in keyof T]: T[P] extends { type: "number" }
    ? number
    : T[P] extends { type: "boolean" }
      ? boolean
      : T[P] extends { type: "string" }
        ? string
        : T[P] extends { type: "array" }
          ? string[]
          : never;
} & { execute?: boolean };

const defaultArgumentSpecs: ArgumentSpecs = {
  execute: {
    alias: "e",
    describe: "Execute the script",
    type: "boolean" as const,
    default: false,
  },
};

export function makeScript<T extends ArgumentSpecs>(
  argumentSpecs: T,
  worker: WorkerFunction<InferArgs<T> & { execute: boolean }>
): void {
  const argv = yargs(hideBin(process.argv));

  const combinedArgumentSpecs = { ...defaultArgumentSpecs, ...argumentSpecs };

  // Configure yargs using the provided argument specifications.
  Object.entries(combinedArgumentSpecs).forEach(([key, options]) => {
    argv.option(key, options);
  });

  argv
    .help("h")
    .alias("h", "help")
    .parseAsync()
    .then(async (args) => {
      const scriptLogger = logger.child({
        execute: args.execute,
      });

      await worker(args as InferArgs<T & { execute: boolean }>, scriptLogger);

      if (!args.execute) {
        console.warn(
          "\x1b[33m%s\x1b[0m", // yellow
          "Script was not executed. Use --execute flag to run the script."
        );
      }

      process.exit(0);
    })
    .catch((error) => {
      console.error("An error occurred:", error);
      process.exit(1);
    });
}

export async function runOnAllWorkspaces(
  worker: (workspace: LightWorkspaceType) => Promise<void>
) {
  const workspaces = await Workspace.findAll({});

  for (const workspace of workspaces) {
    await worker(renderLightWorkspaceType({ workspace }));
  }
}
