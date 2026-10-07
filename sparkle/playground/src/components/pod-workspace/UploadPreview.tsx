import { Card, File02 } from "@dust-tt/sparkle";
import { useEffect, useRef, useState } from "react";

function UploadCard({ file }: { file: File }) {
  const image = useRef<HTMLImageElement>(null);
  const [text, setText] = useState("");
  const extension = file.name.split(".").pop()?.toUpperCase() ?? "FILE";
  const isImage =
    file.type.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif|svg)$/i.test(file.name);
  const isText =
    file.type.startsWith("text/") ||
    /\.(py|js|jsx|ts|tsx|json|md|txt|csv|yaml|yml|css|html|sh)$/i.test(
      file.name
    );
  useEffect(() => {
    if (isImage && image.current) {
      const url = URL.createObjectURL(file);
      image.current.src = url;
      return () => URL.revokeObjectURL(url);
    }
    if (isText) {
      let active = true;
      void file
        .slice(0, 4096)
        .text()
        .then((value) => {
          if (active) {
            setText(value);
          }
        })
        .catch(() => {
          if (active) {
            setText("");
          }
        });
      return () => {
        active = false;
      };
    }
  }, [file, isImage, isText]);
  const size =
    file.size < 1024
      ? `${file.size} B`
      : file.size < 1024 * 1024
        ? `${(file.size / 1024).toFixed(1)} KB`
        : `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
  return (
    <Card
      variant="primary"
      size="sm"
      containerClassName="w-52 max-w-full shrink-0"
      className="flex h-full flex-col overflow-hidden !p-0"
    >
      <div className="flex h-28 w-full items-center justify-center overflow-hidden border-b border-border bg-muted/40">
        {isImage ? (
          <img
            ref={image}
            alt={file.name}
            className="h-full w-full object-contain p-2"
          />
        ) : text ? (
          <pre
            aria-hidden="true"
            className="h-full w-full overflow-hidden whitespace-pre-wrap break-all p-3 text-[10px] leading-4 text-muted-foreground"
          >
            {text}
          </pre>
        ) : (
          <File02 className="size-10 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 p-3">
        <p className="break-all text-sm font-medium">{file.name}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {extension} · {size}
        </p>
      </div>
    </Card>
  );
}

export function UploadPreview({ files }: { files: File[] }) {
  return (
    <div aria-label="Files to upload" className="flex flex-wrap gap-3">
      {files.map((file, index) => (
        <UploadCard
          key={`${file.name}:${file.lastModified}:${index}`}
          file={file}
        />
      ))}
    </div>
  );
}
