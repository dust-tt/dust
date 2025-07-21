import fs from "fs";
import path from "path";

/**
 * Saves a YAML string to a local file
 * Following the design doc structure: workspaces/{workspace_id}/drafts/{user_id}/{agent_id}_{timestamp}.yaml
 */
export async function saveYAMLFile(
  yamlContent: string,
  agentSId: string,
  workspaceId: string,
  isDraft: boolean,
  userId?: string
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${agentSId}_${timestamp}.yaml`;

  // Create directory structure based on design doc
  const baseDir = path.join(process.cwd(), "agent_configs");
  const workspaceDir = path.join(baseDir, "workspaces", workspaceId);
  const targetDir = isDraft
    ? path.join(workspaceDir, "drafts", userId || "user_temp")
    : path.join(workspaceDir, "published", agentSId);

  // Ensure directory exists
  await fs.promises.mkdir(targetDir, { recursive: true });

  const filePath = path.join(targetDir, filename);

  // Write YAML content to file
  await fs.promises.writeFile(filePath, yamlContent, "utf-8");

  return filePath;
}
