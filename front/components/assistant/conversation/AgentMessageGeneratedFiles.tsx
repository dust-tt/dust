import {
  Citation,
  CitationIcons,
  CitationIndex,
  CitationTitle,
} from "@dust-tt/sparkle";

import { useInteractiveContentContext } from "@app/components/assistant/conversation/content/InteractiveContentContext";
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
}: AgentMessageGeneratedFilesProps) {
  return (
    <Citation href={document.href} tooltip={document.title}>
      <CitationContent document={document} index={index} />
    </Citation>
  );
}

// TODO(INTERACTIVE_CONTENT): This is a temporary component to handle interactive content.
// Should be a proper tile component.
function InteractiveAgentMessageGeneratedFiles({
  document,
  index,
}: AgentMessageGeneratedFilesProps) {
  const { openContent } = useInteractiveContentContext();

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
