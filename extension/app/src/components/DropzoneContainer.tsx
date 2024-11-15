import {
  isSupportedFileContentType,
  isSupportedImageContentType,
  isSupportedPlainTextContentType,
  supportedImage,
  supportedPlainText,
} from "@dust-tt/client";
import { DropzoneOverlay } from "@dust-tt/sparkle";
import { useFileDrop } from "@extension/components/conversation/FileUploaderContext";
import { useEffect } from "react";
import { useDropzone } from "react-dropzone";
interface DropzoneContainerProps {
  children: React.ReactNode;
  description: string;
  title: string;
}

const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

const generateFileName = (blob: Blob) => {
  const extensions =
    (isSupportedImageContentType(blob.type) && supportedImage[blob.type]) ||
    (isSupportedPlainTextContentType(blob.type) &&
      supportedPlainText[blob.type]);
  const extension = extensions ? extensions[0] : "";
  const name = Array(12)
    .fill(null)
    .map(() => chars[Math.floor(Math.random() * chars.length)])
    .join("");
  return `${name}${extension}`;
};

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

  const rootProps = getRootProps();

  useEffect(() => {
    if (rootProps.ref.current) {
      const element = rootProps.ref.current;
      const listener = async (e: React.DragEvent) => {
        if (e.dataTransfer) {
          const droppedUrl = e.dataTransfer.getData("text/uri-list");
          if (droppedUrl) {
            const response = await fetch(droppedUrl);
            const blob = await response.blob();

            if (isSupportedFileContentType(blob.type)) {
              const filename = droppedUrl.startsWith("data:")
                ? generateFileName(blob)
                : decodeURIComponent(
                    droppedUrl.split("/").pop() || generateFileName(blob)
                  );

              const file = new File([blob], filename, {
                type: blob.type,
              });

              onDrop([file]);
            }
          }
        }
      };
      element.addEventListener("drop", listener, false);
      return () => {
        element.removeEventListener("drop", listener);
      };
    }
  }, [rootProps.ref.current]);

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
      event.preventDefault();
      setDroppedFiles(files);
    }
  };

  return (
    <div
      {...rootProps}
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
