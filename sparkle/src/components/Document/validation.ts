import type { MarkType, Node, NodeType, Schema } from "@tiptap/pm/model";
import { z } from "zod";
import { DOCUMENT_MAX_VISUALS, DocumentVisual } from "./DocumentVisual";

export const DOCUMENT_MAX_BYTES = 512 * 1024;
const MAX_DOCUMENT_DEPTH = 64;
const MAX_DOCUMENT_NODES = 10_000;
const documentEncoder = new TextEncoder();

export const isDocumentSourceWithinLimit = (source: string): boolean =>
  source.length <= DOCUMENT_MAX_BYTES &&
  documentEncoder.encode(source).byteLength <= DOCUMENT_MAX_BYTES;

// Preserve keys such as __proto__ until the schema allowlist checks them.
const attributes = z.custom<Record<string, unknown>>(
  (value) =>
    value !== null && typeof value === "object" && !Array.isArray(value)
);
const markEnvelope = z
  .object({ type: z.string(), attrs: attributes.optional() })
  .strict();
const nodeEnvelope = z
  .object({
    type: z.string(),
    attrs: attributes.optional(),
    marks: z.array(markEnvelope).optional(),
    content: z.array(z.unknown()).optional(),
    text: z.string().min(1).optional(),
  })
  .strict();

const hasKnownAttributes = (
  type: NodeType | MarkType,
  values: Record<string, unknown> | undefined
) =>
  Object.keys(values ?? {}).every((key) =>
    Object.hasOwn(type.spec.attrs ?? {}, key)
  );

/**
 * @cc [owner:flvndvd,label:security] document-json-validation
 * Untrusted JSON MUST be bounded before recursive schema operations. Unknown nodes,
 * marks, fields and attributes MUST be rejected rather than silently discarded.
 * Attribute values and structure MUST satisfy the same schema used by the editor.
 */
export const validateDocumentJSON = (
  value: unknown,
  schema: Schema
): { ok: true; node: Node } | { ok: false; error: string } => {
  const pending = [{ value, depth: 0 }];
  let count = 0;
  let visuals = 0;

  while (pending.length > 0) {
    const entry = pending.pop();
    if (!entry) {
      break;
    }
    count += 1;

    if (count > MAX_DOCUMENT_NODES || entry.depth > MAX_DOCUMENT_DEPTH) {
      return { ok: false, error: "This document has too many nested blocks." };
    }

    const parsed = nodeEnvelope.safeParse(entry.value);
    if (!parsed.success) {
      return {
        ok: false,
        error: "A document block contains unsupported fields.",
      };
    }
    const node = parsed.data;
    if (!Object.hasOwn(schema.nodes, node.type)) {
      return { ok: false, error: `Unsupported block: ${node.type}.` };
    }
    if (node.type === DocumentVisual.name && ++visuals > DOCUMENT_MAX_VISUALS) {
      return {
        ok: false,
        error: `A document can contain at most ${DOCUMENT_MAX_VISUALS} visuals.`,
      };
    }
    if (entry.depth === 0 && node.type !== schema.topNodeType.name) {
      return { ok: false, error: "The document must start with a doc block." };
    }
    if (!hasKnownAttributes(schema.nodes[node.type], node.attrs)) {
      return { ok: false, error: `Unsupported attributes on ${node.type}.` };
    }
    if (
      (node.type === "text" && node.content !== undefined) ||
      (node.type !== "text" && node.text !== undefined)
    ) {
      return {
        ok: false,
        error: "A document block contains unexpected text or children.",
      };
    }
    if ((node.marks?.length ?? 0) > Object.keys(schema.marks).length) {
      return {
        ok: false,
        error: "A text block contains too many formatting marks.",
      };
    }
    for (const mark of node.marks ?? []) {
      if (!Object.hasOwn(schema.marks, mark.type)) {
        return { ok: false, error: `Unsupported formatting: ${mark.type}.` };
      }
      if (!hasKnownAttributes(schema.marks[mark.type], mark.attrs)) {
        return { ok: false, error: `Unsupported attributes on ${mark.type}.` };
      }
    }
    for (const child of node.content ?? []) {
      pending.push({ value: child, depth: entry.depth + 1 });
    }
    if (count + pending.length > MAX_DOCUMENT_NODES) {
      return { ok: false, error: "This document has too many blocks." };
    }
  }

  let node: Node;
  try {
    node = schema.nodeFromJSON(value);
    node.check();
  } catch {
    return {
      ok: false,
      error: "A document block has invalid attributes or content.",
    };
  }

  return { ok: true, node };
};
