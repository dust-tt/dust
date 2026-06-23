import {
  FILE_SEARCH_NODE_TYPE,
  FileSearchNode,
} from "@app/components/editor/extensions/input_bar/FileSearchNode";
import {
  type FileSearchNodeOptions,
  FileSearchNodeView,
} from "@app/components/editor/extensions/input_bar/FileSearchNodeView";
import type { NodeViewProps } from "@tiptap/react";
import { ReactNodeViewRenderer } from "@tiptap/react";

export { FILE_SEARCH_NODE_TYPE };

const DEFAULT_FILE_SEARCH_NODE_OPTIONS: FileSearchNodeOptions = {
  conversationIdRef: { current: null },
  owner: undefined,
  spaceIdRef: { current: null },
};

export const InputBarFileSearchNode =
  FileSearchNode.extend<FileSearchNodeOptions>({
    addOptions() {
      return DEFAULT_FILE_SEARCH_NODE_OPTIONS;
    },

    addNodeView() {
      return ReactNodeViewRenderer((props: NodeViewProps) => (
        <FileSearchNodeView {...props} options={this.options} />
      ));
    },
  });
