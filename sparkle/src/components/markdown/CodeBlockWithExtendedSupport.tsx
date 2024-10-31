import mermaid from "mermaid";
import React, { useContext, useEffect, useRef, useState } from "react";

import { IconButton } from "@sparkle/components/IconButton";
import { CodeBlock } from "@sparkle/components/markdown/CodeBlock";
import { ContentBlockWrapperContext } from "@sparkle/components/markdown/ContentBlockWrapper";
import { MarkdownContentContext } from "@sparkle/components/markdown/MarkdownContentContext";
import { SparklesIcon, WrenchIcon } from "@sparkle/icons";
import { cn } from "@sparkle/lib/utils";

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
  const { isStreaming } = useContext(MarkdownContentContext);
  const { isDarkMode, setIsDarkMode } = useContext(ContentBlockWrapperContext);

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
      <div className="s-w-full s-gap-2 s-bg-slate-100 s-align-bottom">
        <div className="s-absolute s-left-2 s-top-2 s-mx-2 s-flex s-gap-2">
          <div
            className={cn(
              "text-xs",
              showMermaid ? "s-text-slate-400" : "s-text-slate-300"
            )}
          >
            <a
              onClick={() => setShowMermaid(!showMermaid)}
              className="s-cursor-pointer"
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
      </div>
    );
  }

  return (
    <CodeBlock className={className} inline={inline}>
      {children}
    </CodeBlock>
  );
}
