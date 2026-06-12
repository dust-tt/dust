import type { CliCommand } from "@connectors/admin/cli_registry";
import { z } from "zod";

const argsSchema = z.object({
  wId: z.string().optional().describe("Workspace ID"),
  dsId: z.string().optional().describe("Data source ID"),
  connectorId: z.string().optional().describe("Connector ID"),
  fileId: z.string().optional().describe("File ID"),
  fileType: z
    .string()
    .optional()
    .describe("File type for export (document | presentation)"),
  folderId: z.string().optional().describe("Folder ID"),
  rootFolderId: z.string().optional().describe("Root folder ID"),
  reason: z.string().optional().describe("Reason"),
  fix: z.string().optional().describe("Fix (true/false)"),
  execute: z.string().optional().describe("Execute (true/false)"),
});

const SUBCOMMANDS = [
  "check-file",
  "clean-invalid-parents",
  "export-folder-structure",
  "garbage-collect-all",
  "get-file-metadata",
  "get-google-parents",
  "list-labels",
  "register-all-webhooks",
  "register-webhook",
  "restart-all-incremental-sync-workflows",
  "restart-google-webhooks",
  "skip-file",
  "start-full-sync",
  "start-incremental-sync",
  "update-core-parents",
  "upsert-file",
] as const;

export const googleDriveCommands: CliCommand[] = SUBCOMMANDS.map(
  (subcommand): CliCommand => ({
    path: ["google_drive", subcommand],
    description: `Google Drive ${subcommand}`,
    groupDescription: "Google Drive connector management",
    schema: argsSchema,
    async run(args) {
      const { google_drive } = await import(
        "@connectors/connectors/google_drive/lib/cli"
      );
      return google_drive({
        majorCommand: "google_drive",
        command: subcommand,
        args: args as any,
      });
    },
  })
);
