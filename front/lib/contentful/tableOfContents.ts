import { slugify } from "@app/types/shared/utils/string_utils";
import type {
  Block,
  Document,
  Inline,
  Text,
} from "@contentful/rich-text-types";
import { BLOCKS } from "@contentful/rich-text-types";

export interface TocItem {
  id: string;
  text: string;
  level: number;
}

export interface SearchableSection {
  headingId: string | null;
  headingText: string | null;
  content: string;
}

export function isTextNode(node: Block | Inline | Text): node is Text {
  return node.nodeType === "text";
}

export function isBlockOrInline(
  node: Block | Inline | Text
): node is Block | Inline {
  return "content" in node;
}

function extractTextFromNode(node: Block | Inline): string {
  let text = "";
  if ("content" in node) {
    for (const child of node.content) {
      if (isTextNode(child)) {
        text += child.value;
      } else if ("content" in child) {
        text += extractTextFromNode(child);
      }
    }
  }
  return text;
}

const HEADING_TYPES = [
  BLOCKS.HEADING_1,
  BLOCKS.HEADING_2,
  BLOCKS.HEADING_3,
  BLOCKS.HEADING_4,
  BLOCKS.HEADING_5,
  BLOCKS.HEADING_6,
];

export function extractTableOfContents(document: Document): TocItem[] {
  const toc: TocItem[] = [];

  if (!document.content) {
    return toc;
  }

  for (const node of document.content) {
    const level = HEADING_TYPES.indexOf(node.nodeType) + 1;

    if (level > 0) {
      const text = extractTextFromNode(node);
      if (text) {
        toc.push({
          id: slugify(text),
          text,
          level,
        });
      }
    }
  }

  return toc;
}

export function extractSearchableSections(
  document: Document | null
): SearchableSection[] {
  if (!document?.content) {
    return [];
  }

  const sections: SearchableSection[] = [];
  let currentSection: SearchableSection = {
    headingId: null,
    headingText: null,
    content: "",
  };

  for (const node of document.content) {
    const level = HEADING_TYPES.indexOf(node.nodeType) + 1;

    if (level > 0) {
      // Save previous section if it has content
      if (currentSection.content.trim()) {
        sections.push(currentSection);
      }
      // Start new section
      const text = extractTextFromNode(node);
      currentSection = {
        headingId: slugify(text),
        headingText: text,
        content: "",
      };
    } else {
      // Add content to current section
      currentSection.content += extractTextFromNode(node) + " ";
    }
  }

  // Don't forget the last section
  if (currentSection.content.trim()) {
    sections.push(currentSection);
  }

  return sections;
}
