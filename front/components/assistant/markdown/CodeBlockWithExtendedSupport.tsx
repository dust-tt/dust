import { IconButton, SparklesIcon, WrenchIcon } from "@dust-tt/sparkle";
import mermaid from "mermaid";
import React, { useContext, useEffect, useRef, useState } from "react";

import { CodeBlock } from "@app/components/assistant/markdown/CodeBlock";
import { MarkdownContentContext } from "@app/components/assistant/markdown/MarkdownContentContext";
import { classNames } from "@app/lib/utils";

const MermaidGraph: React.FC<{ chart: string }> = ({ chart }) => {
  const graphRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (graphRef.current) {
      mermaid.initialize({ startOnLoad: false });
      graphRef.current.innerHTML = chart;
      void mermaid.init(undefined, graphRef.current);
    }
  }, [chart]);

  return <div ref={graphRef} className="mermaid"></div>;
};

export function CodeBlockWithExtendedSupport({
  children,
  className,
  inline,
}: {
  children?: React.ReactNode;
  className?: string;
  inline?: boolean;
}) {
  const validChildrenContent = String(children).trim();

  const [showMermaid, setShowMermaid] = useState<boolean>(false);
  const [isValidMermaid, setIsValidMermaid] = useState<boolean>(false);
  const { isStreaming, isDarkMode, setIsDarkMode } = useContext(
    MarkdownContentContext
  );

  useEffect(() => {
    if (isStreaming || !validChildrenContent || isValidMermaid || showMermaid) {
      return;
    }

    const checkValidMermaid = async () => {
      try {
        await mermaid.parse(validChildrenContent);
        setIsValidMermaid(true);
        setShowMermaid(true);
      } catch (e) {
        setIsValidMermaid(false);
        setShowMermaid(false);
      }
    };

    void checkValidMermaid();
  }, [
    isStreaming,
    isValidMermaid,
    showMermaid,
    setIsValidMermaid,
    setShowMermaid,
    validChildrenContent,
    setIsDarkMode,
  ]);

  useEffect(() => {
    setIsDarkMode(!showMermaid);
  }, [showMermaid, setIsDarkMode]);

  if (!inline && isValidMermaid) {
    return (
      <div className="w-full gap-2 bg-slate-100 align-bottom">
        <>
          <div className="absolute left-2 top-2 mx-2 flex gap-2">
            <div
              className={classNames(
                "text-xs",
                showMermaid ? "text-slate-400" : "text-slate-300"
              )}
            >
              <a
                onClick={() => setShowMermaid(!showMermaid)}
                className="cursor-pointer"
              >
                {showMermaid ? "See Markdown" : "See Graph"}
              </a>
            </div>
            <IconButton
              variant={isDarkMode ? "ghost" : "outline"}
              size="xs"
              icon={showMermaid ? WrenchIcon : SparklesIcon}
              onClick={() => setShowMermaid(!showMermaid)}
            />
          </div>
          {showMermaid ? (
            <MermaidGraph chart={validChildrenContent} />
          ) : (
            <CodeBlock className={className} inline={inline}>
              {children}
            </CodeBlock>
          )}
        </>
      </div>
    );
  }

  return (
    <CodeBlock className={className} inline={inline}>
      {children}
    </CodeBlock>
  );
}
