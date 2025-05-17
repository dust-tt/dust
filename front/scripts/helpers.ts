import { injectReplacements } from "sequelize/lib/utils/sql";
import type { Options } from "yargs";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { frontSequelize } from "@app/lib/resources/storage";
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

export function getInsertSQL(model: any, data: any) {
  // Build an instance but don't save it
  const instance = model.build(data);

  // Get the QueryGenerator for this dialect
  const queryGenerator = model.sequelize.getQueryInterface().queryGenerator;

  // Get the table name and attributes
  const tableName = model.tableName;
  const values = instance.get({ plain: true });

  // Use the internal insertQuery method
  // This generates the SQL without executing it
  const parameterizedQuery = queryGenerator.insertQuery(
    tableName,
    values,
    model.rawAttributes,
    {}
  );

  // For PostgreSQL, use the bind method from Sequelize Utils
  if (parameterizedQuery.query && parameterizedQuery.bind) {
    // Use the format method to bind parameters
    // This is the proper way to use Sequelize's internal binding
    return injectReplacements(
      parameterizedQuery.query.replace(/\$\d+/g, "?"),
      // @ts-expect-error I know there is a dialect
      frontSequelize.dialect,
      parameterizedQuery.bind
    );
  }
}
