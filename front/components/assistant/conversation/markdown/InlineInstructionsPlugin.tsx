import React from "react";
import { AgentMessageInstructions } from "@app/components/assistant/conversation/AgentMessageInstructions";

export interface InlineCardsContext {
  onApplyInstructions?: (instructions: string) => void;
  currentInstructions?: string;
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
    return (
      <div className="relative mt-4 overflow-hidden rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/10">
        <div className="animate-shimmer absolute left-0 right-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-blue-400 to-transparent" />
        <div className="flex items-center justify-between border-b border-blue-200 px-4 py-2 dark:border-blue-700">
          <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
            Agent Instructions
          </span>
          <span className="animate-pulse text-xs text-blue-600 dark:text-blue-400">
            Generating...
          </span>
        </div>
        <div className="p-4">
          {content ? (
            <pre className="whitespace-pre-wrap font-mono text-sm text-slate-700 dark:text-slate-300">
              {content}
            </pre>
          ) : (
            <div className="text-sm italic text-slate-500 dark:text-slate-400">
              <span className="loading-dots"></span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <AgentMessageInstructions
        instructions={content}
        currentInstructions={context.currentInstructions}
        onApply={context.onApplyInstructions}
        messageId={context.messageId}
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

  const instructionsRegex = /<INSTRUCTIONS>([\s\S]*?)(?:<\/INSTRUCTIONS>|$)/gi;

  let match;
  while ((match = instructionsRegex.exec(content)) !== null) {
    const isComplete = match[0].includes("</INSTRUCTIONS>");

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
