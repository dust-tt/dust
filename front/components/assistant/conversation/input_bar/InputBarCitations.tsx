import {
  Citation,
  CitationClose,
  CitationIcons,
  CitationImage,
  CitationTitle,
  DocumentIcon,
  Icon,
  ImageIcon,
} from "@dust-tt/sparkle";

import type { FileUploaderService } from "@app/hooks/useFileUploaderService";

interface InputBarCitationsProps {
  fileUploaderService: FileUploaderService;
}

export function InputBarCitations({
  fileUploaderService,
}: InputBarCitationsProps) {
  const processContentFragments = () => {
    const nodes: React.ReactNode[] = [];

    for (const blob of fileUploaderService.fileBlobs) {
      const isImage = Boolean(blob.preview);
      nodes.push(
        <>
          <Citation
            key={`cf-${blob.id}`}
            className="w-48"
            isLoading={blob.isUploading}
          >
            {isImage ? (
              <>
                <CitationImage imgSrc={blob.preview ?? ""} />
                <CitationIcons>
                  <Icon visual={ImageIcon} />
                </CitationIcons>
              </>
            ) : (
              <CitationIcons>
                <Icon visual={DocumentIcon} />
              </CitationIcons>
            )}
            <CitationTitle>{blob.id}</CitationTitle>
            <CitationClose
              onClick={() => fileUploaderService.removeFile(blob.id)}
            />
          </Citation>
        </>
      );
    }

    return nodes;
  };

  if (fileUploaderService.fileBlobs.length === 0) {
    return;
  }

  return (
    <div className="mr-4 flex gap-2 overflow-auto border-b border-structure-300/50 pb-3 pt-4">
      {processContentFragments()}
    </div>
  );
}
