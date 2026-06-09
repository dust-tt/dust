import { useFileDrop } from "@app/components/assistant/conversation/FileUploaderContext";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import { cn, DropzoneOverlay } from "@dust-tt/sparkle";
import { useDropzone } from "react-dropzone";

interface DropzoneContainerProps {
  children: React.ReactNode;
  description: string;
  title: string;
  disabled?: boolean;
}

export function DropzoneContainer({
  children,
  description,
  title,
  disabled,
}: DropzoneContainerProps) {
  const { setDroppedFiles } = useFileDrop();
  const isMobile = useIsMobile();

  const onDrop = (acceptedFiles: File[]) => {
    setDroppedFiles(acceptedFiles);
  };

  const { getRootProps, isDragActive } = useDropzone({
    onDrop,
    noKeyboard: true, // To avoid stealing focus when you try to scroll page by arrow keys.
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
      event.preventDefault();
      setDroppedFiles(files);
    }
  };

  if (disabled) {
    return children;
  }

  return (
    <div
      {...getRootProps()}
      className={cn(
        isMobile ? "h-[calc(100dvh-3rem)]" : `h-[calc(100dvh-3rem-0.5rem)]`,
        "flex min-h-0 w-full flex-col items-center"
      )}
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
