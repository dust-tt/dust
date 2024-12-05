import {
  CitationNew,
  CitationNewClose,
  CitationNewIcons,
  CitationNewImage,
  CitationNewTitle,
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
          <CitationNew
            key={`cf-${blob.id}`}
            className="w-48"
            isLoading={blob.isUploading}
          >
            {isImage ? (
              <>
                <CitationNewImage imgSrc={blob.preview ?? ""} />
                <CitationNewIcons>
                  <Icon visual={ImageIcon} />
                </CitationNewIcons>
              </>
            ) : (
              <CitationNewIcons>
                <Icon visual={DocumentIcon} />
              </CitationNewIcons>
            )}
            <CitationNewTitle>{blob.id}</CitationNewTitle>
            <CitationNewClose
              onClick={() => fileUploaderService.removeFile(blob.id)}
            />
          </CitationNew>
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
