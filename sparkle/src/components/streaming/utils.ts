import React from "react";
import { visit } from "unist-util-visit";
import type { Root } from "hast";
import type { DirectiveNode, MarkdownNode, MdastNode } from "./types";

export function isDirectiveNode(node: unknown): node is DirectiveNode {
  return (
    typeof node === "object" &&
    node !== null &&
    "type" in node &&
    typeof (node as Record<string, unknown>).type === "string"
  );
}

export function isReactElementWithProps(
  el: unknown
): el is React.ReactElement<{ children?: React.ReactNode }> {
  return React.isValidElement(el);
}

export function getElementProps(
  el: React.ReactElement
): { children?: React.ReactNode } & Record<string, unknown> {
  return el.props as { children?: React.ReactNode } & Record<string, unknown>;
}

export function showUnsupportedDirective() {
  return (tree: Root) => {
    visit(tree, ["textDirective"], (node: unknown) => {
      if (isDirectiveNode(node) && node.type === "textDirective") {
        node.type = "text";
        node.value = `:${node.name}${
          node.children ? node.children.map((c) => c.value).join("") : ""
        }`;
      }
    });
  };
}

export function keyOf(
  node: MarkdownNode | undefined,
  fallback: string
): string {
  return node?.position?.start
    ? `${node.position.start.line}:${node.position.start.column}`
    : fallback;
}

export function flatten(child: React.ReactNode): string {
  if (typeof child === "string") return child;
  if (Array.isArray(child)) return child.map((c) => flatten(c)).join("");
  if (isReactElementWithProps(child)) {
    const props = getElementProps(child);
    return flatten(props.children);
  }
  return "";
}

export function mdToText(n: MdastNode | undefined): string {
  if (!n) return "";
  switch (n.type) {
    case "text":
      return n.value || "";
    case "paragraph":
    case "emphasis":
    case "strong":
    case "delete":
    case "link":
      return (n.children || []).map(mdToText).join("");
    case "inlineCode":
      return n.value || "";
    case "break":
      return "\n";
    default:
      return "";
  }
}
