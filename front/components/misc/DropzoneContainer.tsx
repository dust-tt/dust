import { ArrowDownOnSquareIcon, Icon } from "@dust-tt/sparkle";
import { useDropzone } from "react-dropzone";

import { useFileDrop } from "@app/components/assistant/conversation/FileUploaderContext";

interface DropzoneContainerProps {
  children: React.ReactNode;
  dropMessage: string;
}

export function DropzoneContainer({
  children,
  dropMessage,
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
      {isDragActive && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-blue-100 bg-opacity-80 text-element-700">
          <Icon visual={ArrowDownOnSquareIcon} />
          <p className="text-lg font-semibold">{dropMessage}</p>
        </div>
      )}
      {children}
    </div>
  );
}
