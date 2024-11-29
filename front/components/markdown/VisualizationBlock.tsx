import { Button, EyeIcon, MarkdownContentContext } from "@dust-tt/sparkle";
import type { LightWorkspaceType } from "@dust-tt/types";
import { useContext, useMemo } from "react";
import { visit } from "unist-util-visit";

import { VisualizationActionIframe } from "@app/components/assistant/conversation/actions/VisualizationActionIframe";
import type { CoEditionContextType } from "@app/components/assistant/conversation/co-edition/CoEditionContext";
import { useCoEditionContext } from "@app/components/assistant/conversation/co-edition/CoEditionContext";

const VISUALIZATION_MAGIC_LINE = "{/** visualization-complete */}";

type PositionType = { start: { line: number }; end: { line: number } };

export type VisualizationCustomRenderer = {
  visualization: (
    code: string,
    complete: boolean,
    lineStart: number
  ) => React.JSX.Element;
};

export type InteractiveDocumentCustomRenderer = {
  doc: (
    content: string,
    complete: boolean,
    lineStart: number,
    documentId: string,
    type: string
  ) => React.JSX.Element;
};

type VisualizationBlockProps = {
  position: PositionType;
  customRenderer?: VisualizationCustomRenderer;
};

type InteractiveDocumentBlockProps = {
  position: PositionType;
  id: string;
  type: string;
  customRenderer?: InteractiveDocumentCustomRenderer;
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

export function InteractiveDocumentBlock({
  position,
  id,
  type,
  customRenderer,
}: InteractiveDocumentBlockProps) {
  const { content } = useContext(MarkdownContentContext);

  const docRenderer = useMemo(() => {
    return (
      customRenderer?.["doc"] ||
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
  return docRenderer(code, complete, position.start.line, id, type);
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
          owner={owner}
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

export function getInteractiveDocumentPlugin(
  agentConfigurationId: string,
  version: number
) {
  const makeCustomRenderer = (actions: CoEditionContextType["actions"]) => {
    return {
      doc: (
        code: string,
        complete: boolean,
        lineStart: number,
        id: string,
        type: string
      ) => {
        return (
          <Button
            onClick={() => {
              actions.show();
              actions.addVisualization(id, {
                agentConfigurationId,
                code,
                complete,
                version,
              });
            }}
            icon={EyeIcon}
          />
        );
      },
    };
  };

  const InteractiveDocumentPlugin = ({
    position,
    documentId,
    type,
  }: {
    position: PositionType;
    documentId: string;
    type: string;
  }) => {
    const { actions } = useCoEditionContext();

    const customRenderer = makeCustomRenderer(actions);

    return (
      <InteractiveDocumentBlock
        position={position}
        id={documentId}
        type={type}
        customRenderer={customRenderer}
      />
    );
  };

  return InteractiveDocumentPlugin;
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

export function interactiveDocumentDirective() {
  return (tree: any) => {
    visit(tree, ["containerDirective"], (node) => {
      if (node.name === "doc") {
        const data = node.data || (node.data = {});
        data.hName = "doc";
        data.hProperties = {
          position: node.position,
          documentId: node.attributes["doc-id"],
          type: node.attributes["type"],
        };
      }
    });
  };
}

function sanitizeVisualizationContent(str: string) {
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

function sanitizeInteractiveDocumentContent(str: string) {
  const lines = str.split("\n");

  let openDoc = false;
  for (let i = 0; i < lines.length; i++) {
    // Prepend closing document markdow directive with a magic word to detect that the
    // document is complete solely based on its content during token streaming.
    if (lines[i].trim().startsWith(":::doc")) {
      openDoc = true;
    }

    if (openDoc && lines[i].trim() === ":::") {
      lines.splice(i, 0, VISUALIZATION_MAGIC_LINE);
      openDoc = false;
    }
  }

  return lines.join("\n");
}

export function sanitizeContent(str: string) {
  return sanitizeInteractiveDocumentContent(sanitizeVisualizationContent(str));
}
