import {
  Citation,
  CitationIcons,
  CitationIndex,
  CitationTitle,
} from "@dust-tt/sparkle";

import { useContentContext } from "@app/components/assistant/conversation/content/ContentContext";
import type { MarkdownCitation } from "@app/components/markdown/MarkdownCitation";
import { isInteractiveContentType } from "@app/types";

interface AgentMessageGeneratedFilesProps {
  document: MarkdownCitation;
  index: number;
}

function CitationContent({ document, index }: AgentMessageGeneratedFilesProps) {
  return (
    <>
      <CitationIcons>
        {index !== -1 && <CitationIndex>{index}</CitationIndex>}
        {document.icon}
      </CitationIcons>
      <CitationTitle>{document.title}</CitationTitle>
    </>
  );
}

function DefaultAgentMessageGeneratedFiles({
  document,
  index,
}: {
  document: MarkdownCitation;
  index: number;
}) {
  return (
    <Citation href={document.href} tooltip={document.title}>
      <CitationContent document={document} index={index} />
    </Citation>
  );
}

function InteractiveAgentMessageGeneratedFiles({
  document,
  index,
}: {
  document: MarkdownCitation;
  index: number;
}) {
  const { openContent } = useContentContext();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();

    if (document.fileId) {
      openContent(document.fileId);
    }
  };

  return (
    <Citation tooltip={document.title} onClick={handleClick}>
      <CitationContent document={document} index={index} />
    </Citation>
  );
}

export function AgentMessageGeneratedFiles({
  document,
  index,
}: AgentMessageGeneratedFilesProps) {
  const isInteractive = isInteractiveContentType(document.contentType || "");

  if (isInteractive) {
    return (
      <InteractiveAgentMessageGeneratedFiles
        document={document}
        index={index}
      />
    );
  }

  return (
    <DefaultAgentMessageGeneratedFiles document={document} index={index} />
  );
}
