import { cn } from "@dust-tt/sparkle";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";

export const FileImageComponent = (props: NodeViewProps) => {
  const { node, selected } = props;

  const { workspaceId } = props.extension.options;
  const src = `/api/w/${workspaceId}/files/${node.attrs.fileId}?action=view`;

  return (
    <NodeViewWrapper className="flex justify-center">
      <div
        className={cn(
          "relative w-full max-w-2xl",
          selected &&
            "before:absolute before:inset-0 before:rounded-lg before:bg-gray-200/30"
        )}
      >
        <img
          src={node.attrs.src || src}
          alt={node.attrs.alt || ""}
          data-dust-file-id={node.attrs.fileId}
          className={cn(
            "w-full rounded-lg object-cover",
            selected && "opacity-80"
          )}
          loading="lazy"
        />
        {node.attrs.alt && (
          <div className="mt-1 text-center text-xs text-gray-500">
            {node.attrs.alt}
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
};
