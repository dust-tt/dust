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

function isTextNode(node: Block | Inline | Text): node is Text {
  return node.nodeType === "text";
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

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function extractTableOfContents(document: Document): TocItem[] {
  const toc: TocItem[] = [];

  if (!document.content) {
    return toc;
  }

 const HEADING_TYPES = [
  BLOCKS.HEADING_1,
  BLOCKS.HEADING_2,
  BLOCKS.HEADING_3,
  BLOCKS.HEADING_4,
  BLOCKS.HEADING_5,
  BLOCKS.HEADING_6,
];

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
