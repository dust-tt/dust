import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import { formatDistanceToNow } from "date-fns";

interface ModelNodeContentViewProps {
  node: {
    attrs: {
      timestamp: string;
      content: {
        text: string;
        heading?: string;
      };
    };
  };
}

export function ModelNodeContentView({ node }: ModelNodeContentViewProps) {
  const { timestamp, content } = node.attrs;
  const timeAgo = formatDistanceToNow(new Date(timestamp), { addSuffix: true });

  return (
    <NodeViewWrapper className="my-4 rounded-lg border-2 border-red-500 p-4">
      <div className="mb-2 flex justify-end">
        <span className="text-sm text-gray-500">{timeAgo}</span>
      </div>
      <div className="py-2">
        {content.heading && (
          <h3 className="mb-2 text-xl font-semibold text-gray-900">
            {content.heading}
          </h3>
        )}
        <NodeViewContent className="prose prose-sm max-w-none text-gray-700" />
      </div>
    </NodeViewWrapper>
  );
}
