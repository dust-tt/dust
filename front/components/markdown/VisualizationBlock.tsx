import { MarkdownContentContext } from "@dust-tt/sparkle";
import { useContext, useMemo } from "react";
import { visit } from "unist-util-visit";

import { VisualizationActionIframe } from "@app/components/assistant/conversation/actions/VisualizationActionIframe";
import type { LightWorkspaceType } from "@app/types";

const VISUALIZATION_MAGIC_LINE = "{/** visualization-complete */}";

type PositionType = { start: { line: number }; end: { line: number } };

export type CustomRenderers = {
  visualization: (
    code: string,
    complete: boolean,
    lineStart: number
  ) => React.JSX.Element;
};

type VisualizationBlockProps = {
  position: PositionType;
  customRenderer?: CustomRenderers;
};
function VisualizationBlock({
  position,
  customRenderer,
}: VisualizationBlockProps) {
  const { content } = useContext(MarkdownContentContext);

  const visualizationRenderer = useMemo(() => {
    return (
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      customRenderer?.visualization ||
      (() => (
        <div className="pb-2 pt-4 font-medium text-warning">
          Visualization not available
        </div>
      ))
    );
  }, [customRenderer]);

  let code = content
    .split("\n")
    .slice(position.start.line, position.end.line - 1)
    .join("\n");
  let complete = false;
  if (code.includes(VISUALIZATION_MAGIC_LINE)) {
    code = code.replace(VISUALIZATION_MAGIC_LINE, "");
    complete = true;
  }
  return visualizationRenderer(code, complete, position.start.line);
}

export function getVisualizationPlugin(
  owner: LightWorkspaceType,
  agentConfigurationId: string,
  conversationId: string,
  messageId: string
) {
  const customRenderer = {
    visualization: (code: string, complete: boolean, lineStart: number) => {
      return (
        <VisualizationActionIframe
          workspaceId={owner.sId}
          visualization={{
            code,
            complete,
            identifier: `viz-${messageId}-${lineStart}`,
          }}
          key={`viz-${messageId}-${lineStart}`}
          conversationId={conversationId}
          agentConfigurationId={agentConfigurationId}
        />
      );
    },
  };

  const VisualizationPlugin = ({ position }: { position: PositionType }) => {
    return (
      <VisualizationBlock position={position} customRenderer={customRenderer} />
    );
  };

  return VisualizationPlugin;
}

export function visualizationDirective() {
  return (tree: any) => {
    visit(tree, ["containerDirective"], (node) => {
      if (node.name === "visualization") {
        const data = node.data || (node.data = {});
        data.hName = "visualization";
        data.hProperties = {
          position: node.position,
        };
      }
    });
  };
}

export function sanitizeVisualizationContent(str: string) {
  const lines = str.split("\n");

  let openVisualization = false;
  for (let i = 0; i < lines.length; i++) {
    // (2) Replace legacy <visualization> XML tags by the markdown directive syntax for backward
    // compatibility with older <visualization> tags.
    if (lines[i].trim() === "<visualization>") {
      lines[i] = ":::visualization";
    }
    if (lines[i].trim() === "</visualization>") {
      lines[i] = ":::";
    }

    // (3) Prepend closing visualization markdow directive with a magic word to detect that the
    // visualization is complete solely based on its content during token streaming.
    if (lines[i].trim().startsWith(":::visualization")) {
      openVisualization = true;
    }
    if (openVisualization && lines[i].trim() === ":::") {
      lines.splice(i, 0, VISUALIZATION_MAGIC_LINE);
      openVisualization = false;
    }
  }

  return lines.join("\n");
}
