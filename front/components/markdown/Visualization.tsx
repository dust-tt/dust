import { useContext, useMemo } from "react";

import type { CustomRenderers } from "@app/components/assistant/markdown/RenderMessageMarkdown";
import { MarkDownContentContext } from "@app/components/assistant/markdown/RenderMessageMarkdown";

const VISUALIZATION_MAGIC_LINE = "{/** visualization-complete */}";

export function VisualizationBlock({
  position,
  customRenderer,
}: {
  position: { start: { line: number }; end: { line: number } };
  customRenderer?: CustomRenderers;
}) {
  const { content } = useContext(MarkDownContentContext);

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
