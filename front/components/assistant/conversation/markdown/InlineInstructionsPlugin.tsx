import React, { useEffect, useMemo, useState } from "react";
import { Button, ChevronDownIcon, ChevronUpIcon } from "@dust-tt/sparkle";
import { AgentMessageInstructions } from "@app/components/assistant/conversation/AgentMessageInstructions";
import { AgentMessageToolSuggestion, type ToolSuggestion } from "@app/components/assistant/conversation/AgentMessageToolSuggestion";

export interface InlineCardsContext {
  onApplyInstructions?: (instructions: string) => void;
  currentInstructions?: string;
  onAddTool?: (tool: ToolSuggestion) => Promise<boolean> | boolean;
  currentToolIds?: string[];
  messageId: string;
  isStreaming?: boolean;
}

export function InlineInstructionsComponent({
  content,
  context,
  isPartial = false,
}: {
  content: string;
  context: InlineCardsContext;
  isPartial?: boolean;
}) {
  if (isPartial && context.isStreaming) {
    const [isExpanded, setIsExpanded] = useState(true);
    const [userToggled, setUserToggled] = useState(false);
    const lineCount = useMemo(() => (content || "").split("\n").length, [content]);
    const isCollapsible = lineCount > 16 || (content?.length || 0) > 1200;

    useEffect(() => {
      if (isCollapsible && !userToggled) {
        setIsExpanded(false);
      } else if (!isCollapsible && !userToggled) {
        setIsExpanded(true);
      }
    }, [isCollapsible, content, userToggled]);

    const showExpanded = isCollapsible ? isExpanded : true;

    const displayContent = (content || "").trimStart();
    return (
      <div className="relative mt-2 overflow-hidden rounded-lg border border-separator bg-slate-50 dark:bg-slate-900/10">
        <div className="flex items-center justify-between border-b border-separator px-4 py-2">
          <span className="text-sm font-medium text-slate-800 dark:text-slate-200">Agent Instructions</span>
          <span className="animate-pulse text-xs text-muted-foreground">Generating…</span>
        </div>
        <div className="relative p-3">
          {content ? (
            <div
              className={
                "whitespace-pre-wrap font-sans text-sm text-slate-700 dark:text-slate-300 overflow-hidden transition-all duration-300 ease-in-out " +
                (isCollapsible ? (showExpanded ? "max-h-[9999px]" : "max-h-80") : "max-h-[9999px]")
              }
            >
              {displayContent}
            </div>
          ) : (
            <div className="text-sm italic text-slate-500 dark:text-slate-400">
              <span className="loading-dots"></span>
            </div>
          )}
          {isCollapsible && !showExpanded && (
            <div className="pointer-events-none absolute bottom-3 left-3 right-3 h-16 bg-gradient-to-t from-slate-50 dark:from-slate-900/10 to-transparent" />
          )}
          {isCollapsible && (
            <div className="mt-2 flex justify-center">
              <Button
                size="xs"
                variant="ghost"
                icon={showExpanded ? ChevronUpIcon : ChevronDownIcon}
                label={showExpanded ? "Collapse" : "Expand"}
                onClick={() => {
                  setIsExpanded((v) => !v);
                  setUserToggled(true);
                }}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <AgentMessageInstructions
        instructions={content}
        currentInstructions={context.currentInstructions}
        onApply={context.onApplyInstructions}
        messageId={context.messageId}
        disableApply={context.isStreaming || isPartial}
        autoInlineReview={!isPartial}
      />
    </div>
  );
}

function cleanupMarkdownArtifacts(text: string): string {
  text = text.replace(/```[a-z]*\s*```/gi, "");
  text = text.replace(/^\s*[-*]\s*$/gm, "");
  text = text.replace(/^\s*#+\s*$/gm, "");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.trim();
  return text;
}

export function processContentWithInlineCards(
  content: string,
  context: InlineCardsContext
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;

  const instructionsRegex = /<AGENT_INSTRUCTIONS>([\s\S]*?)(?:<\/AGENT_INSTRUCTIONS>|$)/gi;
  const addToolsRegex = /<ADD_TOOLS>([\s\S]*?)(?:<\/ADD_TOOLS>|$)/gi;

  let match;
  while ((match = instructionsRegex.exec(content)) !== null) {
    const isComplete = match[0].includes("</AGENT_INSTRUCTIONS>");

    if (match.index > lastIndex) {
      const textBefore = content.substring(lastIndex, match.index);
      const cleanedText = cleanupMarkdownArtifacts(textBefore);
      if (cleanedText.trim()) {
        nodes.push(<span key={`text-${lastIndex}`}>{cleanedText}</span>);
      }
    }

    nodes.push(
      <InlineInstructionsComponent
        key={`instructions-${match.index}`}
        content={match[1]}
        context={context}
        isPartial={!isComplete}
      />
    );

    lastIndex = match.index + match[0].length;
  }

  // Parse tool blocks and render suggestion cards
  addToolsRegex.lastIndex = 0;
  while ((match = addToolsRegex.exec(content)) !== null) {
    const isComplete = match[0].includes("</ADD_TOOLS>");
    const toolsContent = match[1] ?? "";

    const toolRegex = /<TOOL>([\s\S]*?)(?:<\/TOOL>|$)/gi;
    const tools: ToolSuggestion[] = [];
    let tMatch: RegExpExecArray | null;
    while ((tMatch = toolRegex.exec(toolsContent)) !== null) {
      const block = tMatch[1] ?? "";
      const id = (block.match(/<ID>([\s\S]*?)<\/ID>/i)?.[1] ?? "").trim();
      const name = (block.match(/<NAME>([\s\S]*?)<\/NAME>/i)?.[1] ?? "").trim();
      const type = (block.match(/<TYPE>([\s\S]*?)<\/TYPE>/i)?.[1] ?? "").trim();
      const reason = (block.match(/<REASON>([\s\S]*?)<\/REASON>/i)?.[1] ?? "").trim();
      if (id) {
        tools.push({ id, name, type, reason });
      }
    }

    // Insert text before this block, if any
    if (match.index > lastIndex) {
      const textBefore = content.substring(lastIndex, match.index);
      const cleanedText = cleanupMarkdownArtifacts(textBefore);
      if (cleanedText.trim()) {
        nodes.push(<span key={`text-${lastIndex}`}>{cleanedText}</span>);
      }
    }

    nodes.push(
      <div key={`tools-${match.index}`} className="mt-2">
        <AgentMessageToolSuggestion
          tools={tools}
          currentTools={context.currentToolIds}
          onAddTool={context.onAddTool}
          messageId={context.messageId}
        />
      </div>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    const remainingText = content.substring(lastIndex);
    const cleanedText = cleanupMarkdownArtifacts(remainingText);
    if (cleanedText.trim()) {
      nodes.push(<span key={`text-${lastIndex}`}>{cleanedText}</span>);
    }
  }

  if (nodes.length === 0) {
    const cleanedContent = cleanupMarkdownArtifacts(content);
    if (cleanedContent.trim()) {
      return [<span key="original">{cleanedContent}</span>];
    }
    return [];
  }

  return nodes;
}
