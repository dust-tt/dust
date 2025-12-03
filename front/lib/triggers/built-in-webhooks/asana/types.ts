import { z } from "zod";

export const AsanaWorkspaceSchema = z.object({
  gid: z.string(),
  name: z.string(),
});

export type AsanaWorkspace = z.infer<typeof AsanaWorkspaceSchema>;

export const AsanaProjectSchema = z.object({
  gid: z.string(),
  name: z.string(),
});

export type AsanaProject = z.infer<typeof AsanaProjectSchema>;

export const AsanaAdditionalDataSchema = z.object({
  workspaces: z.array(AsanaWorkspaceSchema),
  projectsByWorkspace: z.record(z.string(), z.array(AsanaProjectSchema)),
});

export type AsanaAdditionalData = z.infer<typeof AsanaAdditionalDataSchema>;

export function isAsanaWorkspace(data: unknown): data is AsanaWorkspace {
  const result = AsanaWorkspaceSchema.safeParse(data);
  return result.success;
}

export function isAsanaProject(data: unknown): data is AsanaProject {
  const result = AsanaProjectSchema.safeParse(data);
  return result.success;
}

export type AsanaWebhookCreateMetadata = {
  workspace: AsanaWorkspace;
  project: AsanaProject;
};

export type AsanaWebhookMetadata = AsanaWebhookCreateMetadata & {
  webhookId: string;
};

export function isAsanaWebhookCreateMetadata(
  metadata: Record<string, unknown>
): metadata is AsanaWebhookCreateMetadata {
  return (
    typeof metadata.workspace === "object" &&
    metadata.workspace !== null &&
    isAsanaWorkspace(metadata.workspace) &&
    typeof metadata.project === "object" &&
    metadata.project !== null &&
    isAsanaProject(metadata.project)
  );
}

export function isAsanaWebhookMetadata(
  metadata: Record<string, unknown>
): metadata is AsanaWebhookMetadata {
  return (
    typeof metadata.webhookId === "string" &&
    isAsanaWebhookCreateMetadata(metadata)
  );
}
