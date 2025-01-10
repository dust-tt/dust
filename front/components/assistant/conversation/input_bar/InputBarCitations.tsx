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
            className="w-40"
            isLoading={blob.isUploading}
            action={
              <CitationClose
                onClick={() => fileUploaderService.removeFile(blob.id)}
              />
            }
            tooltip={blob.id}
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
    <div className="mr-3 flex gap-2 overflow-auto border-b border-separator pb-3 pt-3">
      {processContentFragments()}
    </div>
  );
}
