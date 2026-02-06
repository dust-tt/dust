import { jsonToMarkdown } from "@app/lib/actions/mcp_internal_actions/utils";
import type {
  ProductboardConfigField,
  ProductboardConfiguration,
  ProductboardEntity,
  ProductboardNote,
  ProductboardRelationship,
} from "@app/lib/api/actions/servers/productboard/types";

export function renderNote(note: ProductboardNote): string {
  const lines: string[] = [];

  lines.push(`## Note ${note.id}`);
  lines.push(`**Type:** ${note.type}`);
  if (note.createdAt) {
    lines.push(`*Created at: ${new Date(note.createdAt).toISOString()}*`);
  }
  if (note.updatedAt) {
    lines.push(`*Updated at: ${new Date(note.updatedAt).toISOString()}*`);
  }

  if (note.fields && Object.keys(note.fields).length > 0) {
    lines.push("### Fields");
    const fieldsMarkdown = jsonToMarkdown(note.fields);
    lines.push(fieldsMarkdown);
  }

  if (note.relationships && note.relationships.data.length > 0) {
    lines.push("### Relationships");
    for (const rel of note.relationships.data) {
      const linkText = rel.target.links?.self
        ? ` (API endpoint: ${rel.target.links.self})`
        : "";
      lines.push(
        `- **${rel.type}:** ${rel.target.type} (${rel.target.id})${linkText}`
      );
    }
  }

  if (note.links.self) {
    lines.push(
      `**API Endpoint:** ${note.links.self} (Note: This is an API endpoint for programmatic access, not a user-facing link)`
    );
  }

  return lines.join("\n");
}

export function renderNotesList(
  notes: ProductboardNote[],
  options?: { pageCursor?: string | null; totalResults?: number }
): string {
  if (notes.length === 0) {
    return "No notes found.";
  }

  const lines: string[] = [];

  if (options?.totalResults !== undefined) {
    lines.push(`**Total Results:** ${options.totalResults}`);
    lines.push("");
  }

  for (const note of notes) {
    lines.push(`- **Note ${note.id}** (${note.type})`);
    if (note.fields) {
      const fieldsPreview = jsonToMarkdown(note.fields);
      lines.push(fieldsPreview);
    }
    lines.push("---");
  }

  if (options?.pageCursor) {
    lines.push("");
    lines.push(
      `**More results available.** To fetch the next page, call this tool again with \`page_cursor: "${options.pageCursor}"\`.`
    );
  }

  return lines.join("\n");
}

export function renderEntity(entity: ProductboardEntity): string {
  const lines: string[] = [];

  lines.push(`## Entity ${entity.id}`);
  lines.push(`**Type:** ${entity.type}`);
  if (entity.createdAt) {
    lines.push(`*Created at: ${new Date(entity.createdAt).toISOString()}*`);
  }
  if (entity.updatedAt) {
    lines.push(`*Updated at: ${new Date(entity.updatedAt).toISOString()}*`);
  }

  if (entity.fields && Object.keys(entity.fields).length > 0) {
    lines.push("### Fields");
    const fieldsMarkdown = jsonToMarkdown(entity.fields);
    lines.push(fieldsMarkdown);
  }

  if (entity.relationships && entity.relationships.data.length > 0) {
    lines.push("### Relationships");
    for (const rel of entity.relationships.data) {
      const linkText = rel.target.links?.self
        ? ` (API endpoint: ${rel.target.links.self})`
        : "";
      lines.push(
        `- **${rel.type}:** ${rel.target.type} (${rel.target.id})${linkText}`
      );
    }
  }

  if (entity.links.self) {
    lines.push(
      `**API Endpoint:** ${entity.links.self} (Note: This is an API endpoint for programmatic access, not a user-facing link)`
    );
  }

  return lines.join("\n");
}

export function renderEntitiesList(
  entities: ProductboardEntity[],
  options?: { pageCursor?: string | null }
): string {
  if (entities.length === 0) {
    return "No hierarchy entities found.";
  }

  const lines: string[] = [];
  lines.push(`**Found ${entities.length} entities**\n`);

  for (const entity of entities) {
    lines.push(`- **Entity ${entity.id}** (${entity.type})`);
    if (entity.fields) {
      const fieldsPreview = jsonToMarkdown(entity.fields);
      lines.push(fieldsPreview);
    }
    lines.push("---");
  }

  if (options?.pageCursor) {
    lines.push(
      `**More results available.** To fetch the next page, call this tool again with \`page_cursor: "${options.pageCursor}"\`.`
    );
  }

  return lines.join("\n");
}

function renderConfigField(
  fieldId: string,
  field: ProductboardConfigField
): string {
  const fieldObj: Record<string, unknown> = {
    id: field.id,
    name: field.name,
    path: field.path,
    schema: field.schema,
  };

  if (field.lifecycle) {
    fieldObj.lifecycle = field.lifecycle;
  }

  if (field.constraints) {
    fieldObj.constraints = field.constraints;
  }

  if (field.default !== undefined) {
    fieldObj.default = field.default;
  }

  if (field.values !== undefined) {
    fieldObj.values = field.values;
  }

  const markdown = jsonToMarkdown(fieldObj);
  return `### Field: ${fieldId}\n${markdown}`;
}

export function renderNoteConfiguration(
  config: ProductboardConfiguration
): string {
  const lines: string[] = [];

  lines.push(`## Note Type: ${config.type}`);

  if (config.fields && Object.keys(config.fields).length > 0) {
    lines.push("### Available Fields:");

    for (const [fieldId, field] of Object.entries(config.fields)) {
      lines.push(renderConfigField(fieldId, field));
    }
  } else {
    lines.push("No field configuration available.");
  }

  if (config.relationships && Object.keys(config.relationships).length > 0) {
    lines.push("### Available Relationships:");
    const relationshipsMarkdown = jsonToMarkdown(config.relationships);
    lines.push(relationshipsMarkdown);
  }

  return lines.join("\n");
}

export function renderNoteConfigurationsList(
  configs: ProductboardConfiguration[]
): string {
  if (configs.length === 0) {
    return "No note configurations found.";
  }

  const lines: string[] = [];
  lines.push("# Note Configurations");
  lines.push("Available note types and their fields in this workspace.");
  lines.push(
    "Use this to understand what fields you can set when creating/updating notes."
  );

  for (const config of configs) {
    lines.push(renderNoteConfiguration(config));
    lines.push("---");
  }

  return lines.join("\n").trim();
}

export function renderEntityConfiguration(
  config: ProductboardConfiguration
): string {
  const lines: string[] = [];

  lines.push(`## Entity Type: ${config.type}`);

  if (config.fields && Object.keys(config.fields).length > 0) {
    lines.push("### Available Fields:");

    for (const [fieldId, field] of Object.entries(config.fields)) {
      lines.push(renderConfigField(fieldId, field));
    }
  } else {
    lines.push("No field configuration available.");
  }

  if (config.relationships && Object.keys(config.relationships).length > 0) {
    lines.push("### Available Relationships:");
    const relationshipsMarkdown = jsonToMarkdown(config.relationships);
    lines.push(relationshipsMarkdown);
  }

  return lines.join("\n");
}

export function renderEntityConfigurationsList(
  configs: ProductboardConfiguration[]
): string {
  if (configs.length === 0) {
    return "No entity configurations found.";
  }

  const lines: string[] = [];
  lines.push("# Entity Configurations");
  lines.push("Available entity types and their fields in this workspace.");
  lines.push(
    "Use this to understand what fields you can set when creating/updating entities."
  );

  for (const config of configs) {
    lines.push(renderEntityConfiguration(config));
    lines.push("---");
  }

  return lines.join("\n").trim();
}

export function renderConfigurationsList(
  notesConfigs: ProductboardConfiguration[],
  entitiesConfigs: ProductboardConfiguration[]
): string {
  const lines: string[] = [];

  if (notesConfigs.length > 0) {
    lines.push("### Notes Configurations");
    for (const config of notesConfigs) {
      lines.push(`- Type: **${config.type}**`);
      if (config.fields) {
        const fieldCount = Object.keys(config.fields).length;
        lines.push(`  Fields: ${fieldCount}`);
      }
    }
    lines.push("");
  }

  if (entitiesConfigs.length > 0) {
    lines.push("### Entities Configurations");
    for (const config of entitiesConfigs) {
      lines.push(`- Type: **${config.type}**`);
      if (config.fields) {
        const fieldCount = Object.keys(config.fields).length;
        lines.push(`  Fields: ${fieldCount}`);
      }
    }
    lines.push("");
  }

  if (notesConfigs.length === 0 && entitiesConfigs.length === 0) {
    return "No configurations found.";
  }

  return lines.join("\n");
}

export function renderRelationship(rel: ProductboardRelationship): string {
  const lines: string[] = [];
  lines.push(`- **${rel.type}**`);
  lines.push(`  Target: ${rel.target.type} (${rel.target.id})`);
  if (rel.target.links?.self) {
    lines.push(
      `  API Endpoint: ${rel.target.links.self} (Note: This is an API endpoint for programmatic access, not a user-facing link)`
    );
  }
  return lines.join("\n");
}

export function renderRelationshipsList(
  relationships: ProductboardRelationship[],
  options?: { pageCursor?: string | null; entityId?: string }
): string {
  if (relationships.length === 0) {
    return "No relationships found.";
  }

  const lines: string[] = [];

  if (options?.entityId) {
    lines.push(`## Relationships for Entity ${options.entityId}`);
  } else {
    lines.push("## Relationships");
  }
  lines.push(`Found ${relationships.length} relationship(s)`);

  for (const rel of relationships) {
    lines.push(renderRelationship(rel));
  }

  if (options?.pageCursor) {
    lines.push(
      `**More results available.** To fetch the next page, call this tool again with \`page_cursor: "${options.pageCursor}"\`.`
    );
  }

  return lines.join("\n");
}
