import type { CliCommand } from "@connectors/admin/cli_registry";
import { z } from "zod";

const argsSchema = z.object({
  wId: z.string().optional().describe("Workspace ID"),
  dsId: z.string().optional().describe("Data source ID"),
  connectorId: z.string().optional().describe("Connector ID"),
  owner: z.string().optional().describe("Repository owner"),
  repo: z.string().optional().describe("Repository name"),
  repoId: z.string().optional().describe("Repository ID"),
  repoLogin: z.string().optional().describe("Repository login"),
  repoName: z.string().optional().describe("Repository name"),
  issueNumber: z.string().optional().describe("Issue number"),
  enable: z
    .string()
    .optional()
    .describe('Enable code sync ("true" or "false")'),
  skipReason: z.string().optional().describe("Skip reason"),
  documentId: z.string().optional().describe("Document ID"),
});

const SUBCOMMANDS = [
  "clear-installation-id",
  "code-sync",
  "force-daily-code-sync",
  "list-skipped-repos",
  "resync-repo",
  "resync-repo-code",
  "skip-code-file",
  "skip-issue",
  "skip-repo",
  "sync-issue",
  "unskip-code-file",
  "unskip-repo",
] as const;

export const githubCommands: CliCommand[] = SUBCOMMANDS.map(
  (subcommand): CliCommand => ({
    path: ["github", subcommand],
    description: `GitHub ${subcommand}`,
    groupDescription: "GitHub connector management",
    schema: argsSchema,
    async run(args) {
      const { github } = await import("@connectors/connectors/github/lib/cli");
      return github({
        majorCommand: "github",
        command: subcommand,
        args: args as any,
      });
    },
  })
);
