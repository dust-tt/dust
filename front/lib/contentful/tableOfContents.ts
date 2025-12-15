import type { Block, Document, Text } from "@contentful/rich-text-types";
import { BLOCKS } from "@contentful/rich-text-types";

export interface TocItem {
  id: string;
  text: string;
  level: number;
}

function isTextNode(node: Block | Text): node is Text {
  return node.nodeType === "text";
}

function extractTextFromNode(node: Block): string {
  let text = "";
  if ("content" in node) {
    for (const child of node.content) {
      if (isTextNode(child)) {
        text += child.value;
      } else if ("content" in child) {
        text += extractTextFromNode(child as Block);
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

  for (const node of document.content) {
    if (node.nodeType === BLOCKS.HEADING_1) {
      const text = extractTextFromNode(node);
      if (text) {
        toc.push({
          id: slugify(text),
          text,
          level: 1,
        });
      }
    } else if (node.nodeType === BLOCKS.HEADING_2) {
      const text = extractTextFromNode(node);
      if (text) {
        toc.push({
          id: slugify(text),
          text,
          level: 2,
        });
      }
    } else if (node.nodeType === BLOCKS.HEADING_3) {
      const text = extractTextFromNode(node);
      if (text) {
        toc.push({
          id: slugify(text),
          text,
          level: 3,
        });
      }
    } else if (node.nodeType === BLOCKS.HEADING_4) {
      const text = extractTextFromNode(node);
      if (text) {
        toc.push({
          id: slugify(text),
          text,
          level: 4,
        });
      }
    } else if (node.nodeType === BLOCKS.HEADING_5) {
      const text = extractTextFromNode(node);
      if (text) {
        toc.push({
          id: slugify(text),
          text,
          level: 5,
        });
      }
    } else if (node.nodeType === BLOCKS.HEADING_6) {
      const text = extractTextFromNode(node);
      if (text) {
        toc.push({
          id: slugify(text),
          text,
          level: 6,
        });
      }
    }
  }

  return toc;
}

