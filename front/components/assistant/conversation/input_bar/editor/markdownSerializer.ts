import type { Node as ProseMirrorNode, Schema } from "@tiptap/pm/model";
import type { MarkdownSerializerState } from "prosemirror-markdown";
import {
  defaultMarkdownSerializer,
  MarkdownSerializer,
} from "prosemirror-markdown";

function buildNodeSerializers(schema: Schema) {
  // Start with default serializers.
  const map = { ...defaultMarkdownSerializer.nodes };

  // Add custom node handlers.
  map.bulletList = (state: MarkdownSerializerState, node: ProseMirrorNode) => {
    state.renderList(node, "  ", () => "* ");
  };

  map.orderedList = (state: MarkdownSerializerState, node: ProseMirrorNode) => {
    const start = node.attrs.order || 1;
    state.renderList(node, "  ", (i) => `${start + i}. `);
  };

  map.listItem = (state: MarkdownSerializerState, node: ProseMirrorNode) => {
    state.renderContent(node);
  };

  map.codeBlock = (state: MarkdownSerializerState, node: ProseMirrorNode) => {
    state.write("```" + (node.attrs.language || "") + "\n");
    state.text(node.textContent, false);
    state.ensureNewLine();
    state.write("```\n");
    state.closeBlock(node);
  };

  map.horizontalRule = (state: MarkdownSerializerState) => {
    state.write("\n---\n");
  };

  map.mention = (state: MarkdownSerializerState, node: ProseMirrorNode) => {
    state.write(`:mention[${node.attrs?.label}]{sId=${node.attrs?.id}}`);
  };

  map.dataSourceLink = (
    state: MarkdownSerializerState,
    node: ProseMirrorNode
  ) => {
    state.write(`:content_node_mention[${node.attrs.title}]`);
  };

  map.pastedAttachment = (
    state: MarkdownSerializerState,
    node: ProseMirrorNode
  ) => {
    state.write(
      `:pasted_attachment[${node.attrs.title}]{fileId=${node.attrs.fileId}}`
    );
  };

  // Add fallback for any missing nodes in schema.
  Object.keys(schema.nodes).forEach((nodeName) => {
    if (!map[nodeName]) {
      map[nodeName] = (
        state: MarkdownSerializerState,
        node: ProseMirrorNode
      ) => {
        state.text(node.textContent, false);
      };
    }
  });

  return map;
}

function buildMarkSerializers(schema: Schema) {
  const marks: Record<string, any> = {
    ...defaultMarkdownSerializer.marks,

    // Custom marks with specific syntax.
    bold: {
      open: "**",
      close: "**",
      mixable: true,
      expelEnclosingWhitespace: true,
    },
    italic: {
      open: "_",
      close: "_",
      mixable: true,
      expelEnclosingWhitespace: true,
    },
  };

  // Add fallback for any mark in schema that isn't handled.
  for (const markName of Object.keys(schema.marks)) {
    if (!marks[markName]) {
      marks[markName] = {
        open: "",
        close: "",
        mixable: true,
      };
    }
  }

  return marks;
}

export function createMarkdownSerializer(schema: Schema) {
  const nodes = buildNodeSerializers(schema);
  const marks = buildMarkSerializers(schema);

  return new MarkdownSerializer(nodes, marks);
}
