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
import type { FileUploaderService } from "@extension/hooks/useFileUploaderService";

interface InputBarCitationsProps {
  fileUploaderService: FileUploaderService;
  disabled: boolean;
}

export function InputBarCitations({
  fileUploaderService,
  disabled,
}: InputBarCitationsProps) {
  const processContentFragments = () => {
    const nodes: React.ReactNode[] = [];

    for (const blob of fileUploaderService.fileBlobs) {
      const isImage = Boolean(blob.preview);

      nodes.push(
        <>
          <Citation
            disabled={disabled}
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
    <div className="flex gap-2 overflow-auto border-b border-separator pb-3">
      {processContentFragments()}
    </div>
  );
}
