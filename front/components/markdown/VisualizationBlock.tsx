import { Button, EyeIcon, MarkdownContentContext } from "@dust-tt/sparkle";
import type { LightWorkspaceType } from "@dust-tt/types";
import { useContext, useMemo } from "react";
import { visit } from "unist-util-visit";

import type { CoEditionContextType } from "@app/components/assistant/conversation/co-edition/CoEditionContext";
import { useCoEditionContext } from "@app/components/assistant/conversation/co-edition/CoEditionContext";

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
export function VisualizationBlock({
  position,
  customRenderer,
}: VisualizationBlockProps) {
  const { content } = useContext(MarkdownContentContext);

  const visualizationRenderer = useMemo(() => {
    return (
      customRenderer?.visualization ||
      (() => (
        <div className="pb-2 pt-4 font-medium text-red-600">
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
  const makeCustomRenderer = (actions: CoEditionContextType["actions"]) => {
    return {
      visualization: (code: string, complete: boolean, lineStart: number) => {
        const identifier = `viz-${messageId}-${lineStart}`;

        return (
          <Button
            onClick={() => {
              actions.show();
              actions.addVisualization(identifier, {
                agentConfigurationId,
                code,
                complete,
              });
            }}
            icon={EyeIcon}
          />
        );
      },
    };
  };

  const VisualizationPlugin = ({ position }: { position: PositionType }) => {
    const { actions } = useCoEditionContext();

    const customRenderer = makeCustomRenderer(actions);

    return (
      <>
        <VisualizationBlock
          position={position}
          customRenderer={customRenderer}
        />
      </>
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
