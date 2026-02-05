import type { ProjectMetadataType } from "@dust-tt/client";

/**
 * Formats project metadata as a markdown document.
 */
export function formatProjectMetadata(metadata: ProjectMetadataType): string {
  const sections: string[] = [];

  if (metadata.description) {
    sections.push("# Description");
    sections.push("");
    sections.push(metadata.description);
    sections.push("");
  }

  // Members section
  if (metadata.members && metadata.members.length > 0) {
    sections.push("# Members");
    sections.push("");
    for (const member of metadata.members) {
      sections.push(`- ${member}`);
    }
    sections.push("");
  }

  return sections.join("\n");
}

/**
 * Gets the internal ID for the metadata file in the data source.
 *
 * @param connectorId - The connector ID
 * @param projectId - The project/space ID
 * @returns The internal ID for the metadata file
 */
export function getMetadataFileInternalId(
  connectorId: number,
  projectId: string
): string {
  return `dust-project-${connectorId}-project-${projectId}-metadata`;
}

/**
 * Gets the folder ID for the project.
 *
 * @param connectorId - The connector ID
 * @param projectId - The project/space ID
 * @returns The folder ID for the project
 */
export function getProjectFolderInternalId(
  connectorId: number,
  projectId: string
): string {
  return `dust-project-${connectorId}-project-${projectId}`;
}
