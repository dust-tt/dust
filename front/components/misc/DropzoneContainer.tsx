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

  return (
    <div
      {...getRootProps()}
      className="flex h-full w-full flex-col items-center"
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
