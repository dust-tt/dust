import { Citation } from "@dust-tt/sparkle";
import type { FileUploaderService } from "@extension/hooks/useFileUploaderService";

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
        <Citation
          key={`cf-${blob.id}`}
          title={blob.id}
          size="xs"
          type={isImage ? "image" : "document"}
          imgSrc={blob.preview}
          onClose={() => {
            fileUploaderService.removeFile(blob.id);
          }}
          isLoading={blob.isUploading}
        />
      );
    }

    return nodes;
  };

  if (fileUploaderService.fileBlobs.length === 0) {
    return;
  }

  return (
    <div className="mr-4 flex gap-2 overflow-auto border-b border-structure-300/50 pb-3">
      {processContentFragments()}
    </div>
  );
}
