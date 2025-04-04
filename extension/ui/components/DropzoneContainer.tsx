import { useFileDrop } from "@app/ui/components/conversation/FileUploaderContext";
import {
  isSupportedFileContentType,
  isSupportedImageContentType,
  isSupportedPlainTextContentType,
  supportedImageFileFormats,
  supportedOtherFileFormats,
} from "@dust-tt/client";
import { DropzoneOverlay, useSendNotification } from "@dust-tt/sparkle";
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
    (isSupportedImageContentType(blob.type) &&
      supportedImageFileFormats[blob.type]) ||
    (isSupportedPlainTextContentType(blob.type) &&
      supportedOtherFileFormats[blob.type]);
  const extension = extensions ? extensions[0] : "";
  const name = Array(12)
    .fill(null)
    .map(() => chars[Math.floor(Math.random() * chars.length)])
    .join("");
  return `${name}${extension}`;
};

const getDroppedUrl = (dataTransfer: DataTransfer) => {
  const textHtml = dataTransfer.getData("text/html");
  const droppedUrl = dataTransfer.getData("text/uri-list");
  if (textHtml) {
    const div = document.createElement("div");
    div.innerHTML = textHtml;

    const url = div.querySelector("img")?.src || div.querySelector("a")?.href;
    div.remove();

    if (url) {
      return url;
    }
  }
  return droppedUrl;
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

  const sendNotification = useSendNotification();

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
          const droppedUrl = getDroppedUrl(e.dataTransfer);
          if (droppedUrl) {
            const response = await fetch(droppedUrl);
            const blob = await response.blob();
            const filename = droppedUrl.startsWith("data:")
              ? generateFileName(blob)
              : decodeURIComponent(
                  droppedUrl.split("/").pop() || generateFileName(blob)
                );
            if (blob.type === "text/html") {
              const text = await blob.text();
              const div = document.createElement("div");
              div.innerHTML = text;
              const textBlob = new Blob([div.textContent || ""], {
                type: "text/plain",
              });
              div.remove();
              const file = new File([textBlob], `${filename}.txt`, {
                type: textBlob.type,
              });
              onDrop([file]);
            } else if (isSupportedFileContentType(blob.type)) {
              const file = new File([blob], filename, {
                type: blob.type,
              });
              onDrop([file]);
            } else {
              sendNotification({
                description: "Unsupported file type : " + blob.type,
                title: "Unsupported file type",
                type: "error",
              });
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
