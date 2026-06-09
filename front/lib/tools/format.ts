import { escapeXml } from "@app/types/shared/utils/string_utils";
import { unescape } from "html-escaper";

export type ToolReference = {
  icon: string | null;
  id: string;
  name: string;
};

export const TOOL_TAG_NAME = "tool";

export const TOOL_TAG_REGEX = /<tool\s+([^>]*?)\s*\/>/g;
export const TOOL_TAG_REGEX_BEGINNING = /^<tool\s+([^>]*?)\s*\/>/;

const TOOL_ELEMENT_REGEX = /<tool\b([^>]*)>[\s\S]*?<\/tool>/g;

function parseAttribute(attributes: string, name: string): string | null {
  const value = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attributes)?.[1];
  if (value === undefined || value === "") {
    return null;
  }

  return unescape(value);
}

function parseToolTagAttributes(attributes: string): ToolReference | null {
  const id = parseAttribute(attributes, "id");
  const name = parseAttribute(attributes, "name");

  if (!id || !name) {
    return null;
  }

  return {
    icon: parseAttribute(attributes, "icon"),
    id,
    name,
  };
}

export function parseToolTag(tag: string): ToolReference | null {
  const attributes = TOOL_TAG_REGEX_BEGINNING.exec(tag)?.[1];

  if (!attributes) {
    return null;
  }

  return parseToolTagAttributes(attributes);
}

export function extractToolTags(content: string): ToolReference[] {
  return [...content.matchAll(TOOL_TAG_REGEX)]
    .map((match) => parseToolTag(match[0]))
    .filter((tool): tool is ToolReference => tool !== null);
}

export function serializeToolTag({ icon, id, name }: ToolReference): string {
  return `<${TOOL_TAG_NAME} ${serializeToolTagAttributes({
    icon,
    id,
    name,
  })} />`;
}

function serializeToolTagAttributes({ icon, id, name }: ToolReference): string {
  const iconAttribute = icon ? ` icon="${escapeXml(icon)}"` : "";

  return `id="${escapeXml(id)}" name="${escapeXml(name)}"${iconAttribute}`;
}

export function stripToolTagPresentationAttributes(content: string): string {
  return content
    .replace(TOOL_ELEMENT_REGEX, (tag, attributes: string) => {
      const tool = parseToolTag(`<${TOOL_TAG_NAME}${attributes} />`);
      if (!tool) {
        return tag.replace(/(<tool\b[^>]*?)\s+icon="[^"]*"/, "$1");
      }

      return serializeToolTag({
        ...tool,
        icon: null,
      });
    })
    .replace(TOOL_TAG_REGEX, (tag) => {
      const tool = parseToolTag(tag);
      if (!tool) {
        return tag.replace(/\s+icon="[^"]*"/g, "");
      }

      return serializeToolTag({
        ...tool,
        icon: null,
      });
    });
}
