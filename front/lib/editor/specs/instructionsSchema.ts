import {
  INSTRUCTION_BLOCK_NODE_NAME,
  instructionBlockSpec,
} from "@app/lib/editor/specs/instructionBlockSpec";
import {
  INSTRUCTIONS_ROOT_NODE_NAME,
  instructionsRootSpec,
} from "@app/lib/editor/specs/instructionsRootSpec";
import { Schema } from "prosemirror-model";
import { nodes as basicNodes, marks } from "prosemirror-schema-basic";
import { bulletList, listItem, orderedList } from "prosemirror-schema-list";

/**
 * ProseMirror schema for the agent instructions editor.
 *
 * Mirrors the schema that the client-side Tiptap editor builds from:
 *   InstructionsDocumentExtension (doc → instructionsRoot)
 *   InstructionsRootExtension     (instructionsRoot → block+)
 *   InstructionBlockExtension     (instructionBlock as a block group member)
 *   StarterKit                    (paragraph, heading, lists, code, etc.)
 */
export const INSTRUCTIONS_SCHEMA = new Schema({
  nodes: {
    ...basicNodes,
    bulletList: { ...bulletList, group: "block", content: "listItem+" },
    orderedList: { ...orderedList, group: "block", content: "listItem+" },
    listItem: { ...listItem, content: "paragraph block*" },
    [INSTRUCTION_BLOCK_NODE_NAME]: instructionBlockSpec,
    [INSTRUCTIONS_ROOT_NODE_NAME]: instructionsRootSpec,
    doc: { content: INSTRUCTIONS_ROOT_NODE_NAME },
  },
  marks,
});
