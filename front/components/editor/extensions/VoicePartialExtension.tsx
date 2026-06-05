import { AnimatedText } from "@dust-tt/sparkle";
import type { NodeViewProps } from "@tiptap/core";
import { Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";

function VoicePartialNodeView({ node }: NodeViewProps) {
  return (
    <NodeViewWrapper as="span" className="inline">
      <AnimatedText variant="muted">{node.attrs.text as string}</AnimatedText>
    </NodeViewWrapper>
  );
}

export const VoicePartialNode = Node.create({
  name: "voicePartial",
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      text: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-voice-partial]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", { ...HTMLAttributes, "data-voice-partial": "" }];
  },

  // Used by doc.textBetween and plain-text extractions.
  renderText({ node }) {
    return node.attrs.text as string;
  },

  // Used by @tiptap/markdown when serializing to markdown (e.g. on submit while
  // a partial is still pending). Outputs the partial text as-is.
  renderMarkdown: (node) => (node.attrs?.text as string) ?? "",

  addNodeView() {
    return ReactNodeViewRenderer(VoicePartialNodeView);
  },
});
