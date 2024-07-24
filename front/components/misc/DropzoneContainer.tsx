import { DropzoneOverlay } from "@dust-tt/sparkle";
import { useDropzone } from "react-dropzone";

import { useFileDrop } from "@app/components/assistant/conversation/FileUploaderContext";

interface DropzoneContainerProps {
  children: React.ReactNode;
  description: string;
  title: string;
}

export function DropzoneContainer({
  children,
  description,
  title,
}: DropzoneContainerProps) {
  const { setDroppedFiles } = useFileDrop();

  const onDrop = (acceptedFiles: File[]) => {
    setDroppedFiles(acceptedFiles);
  };

  const { getRootProps, isDragActive } = useDropzone({
    onDrop,
    noClick: true, // Prevent default click behavior.
  });

  const onPaste = (event: React.ClipboardEvent) => {
    const items = event.clipboardData.items;
    const files: File[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) {
          files.push(file);
        }
      }
    }

    if (files.length > 0) {
      setDroppedFiles(files);
    }
  };

  return (
    <div
      {...getRootProps()}
      className="flex h-full w-full flex-col items-center"
      onPaste={onPaste}
    >
      <DropzoneOverlay
        description={description}
        isDragActive={isDragActive}
        title={title}
      />
      {children}
    </div>
  );
}
