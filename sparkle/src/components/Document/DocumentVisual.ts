import { Node } from "@tiptap/core";
import { z } from "zod";

export const DOCUMENT_MAX_VISUALS = 10;
const visualName = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/);

export const DocumentVisualReferenceSchema = z
  .object({ name: visualName })
  .strict();
export type DocumentVisualReference = z.infer<
  typeof DocumentVisualReferenceSchema
>;

/**
 * @cc [owner:flvndvd,label:security] document-visual-reference
 * Visual nodes MUST store only a bounded name. Document JSON MUST NOT contain executable
 * code, arbitrary component props or URLs. Only a host-supplied renderer may resolve a name.
 */
export const DocumentVisual = Node.create({
  name: "dustVisual",
  group: "block",
  atom: true,
  isolating: true,
  draggable: true,
  addAttributes: () => ({
    name: { default: null, validate: visualName.parse },
  }),
  parseHTML: () => [],
  renderHTML: ({ node }) => ["div", {}, `Visual: ${node.attrs.name}`],
});
