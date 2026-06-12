import type { CliCommand } from "@connectors/admin/cli_registry";
import { z } from "zod";

const argsSchema = z.object({
  connectorId: z.number().describe("Connector ID"),
  database: z.string().optional().describe("Database name"),
  schema: z.string().optional().describe("Schema name"),
});

const SUBCOMMANDS = [
  "fetch-databases",
  "fetch-schemas",
  "fetch-tables",
] as const;

export const snowflakeCommands: CliCommand[] = SUBCOMMANDS.map(
  (subcommand): CliCommand => ({
    path: ["snowflake", subcommand],
    description: `Snowflake ${subcommand}`,
    groupDescription: "Snowflake connector management",
    schema: argsSchema,
    async run(args) {
      const { snowflake } = await import(
        "@connectors/connectors/snowflake/lib/cli"
      );
      return snowflake({
        majorCommand: "snowflake",
        command: subcommand,
        args: args as any,
      });
    },
  })
);
