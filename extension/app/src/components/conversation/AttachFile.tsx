import { supportedFileExtensions } from "@dust-tt/client";
import { AttachmentIcon, Button } from "@dust-tt/sparkle";
import type { EditorService } from "@extension/components/input_bar/editor/useCustomEditor";
import type { FileUploaderService } from "@extension/hooks/useFileUploaderService";
import { useRef } from "react";

type AttachFileProps = {
  fileUploaderService: FileUploaderService;
  editorService: EditorService;
  isLoading: boolean;
};

export const AttachFile = ({
  fileUploaderService,
  editorService,
  isLoading,
}: AttachFileProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        accept={supportedFileExtensions.join(",")}
        onChange={async (e) => {
          await fileUploaderService.handleFileChange(e);
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
          editorService.focusEnd();
        }}
        ref={fileInputRef}
        style={{ display: "none" }}
        type="file"
        multiple={true}
      />
      <Button
        icon={AttachmentIcon}
        className="text-muted-foreground"
        tooltip="Attach file"
        variant="ghost"
        size="xs"
        onClick={async () => {
          fileInputRef.current?.click();
        }}
        disabled={isLoading}
      />
    </>
  );
};
