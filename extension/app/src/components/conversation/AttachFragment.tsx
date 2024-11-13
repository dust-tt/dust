import { supportedFileExtensions } from "@dust-tt/client";
import {
  AttachmentIcon,
  Button,
  DocumentTextIcon,
  ImageIcon,
} from "@dust-tt/sparkle";
import type { EditorService } from "@extension/components/input_bar/editor/useCustomEditor";
import type { FileUploaderService } from "@extension/hooks/useFileUploaderService";
import { useRef } from "react";

type AttachFragmentProps = {
  fileUploaderService: FileUploaderService;
  editorService: EditorService;
};

export const AttachFragment = ({
  fileUploaderService,
  editorService,
}: AttachFragmentProps) => {
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
        tooltip={"Attach file"}
        variant="ghost"
        size="xs"
        onClick={async () => {
          fileInputRef.current?.click();
        }}
      />
      <Button
        icon={DocumentTextIcon}
        tooltip={"Attach tab content"}
        variant="ghost"
        size="xs"
        onClick={() =>
          fileUploaderService.uploadContentTab({
            includeContent: true,
            includeScreenshot: false,
          })
        }
      />
      <Button
        icon={ImageIcon}
        tooltip={"Attach tab screenshot"}
        variant="ghost"
        size="xs"
        onClick={() =>
          fileUploaderService.uploadContentTab({
            includeContent: false,
            includeScreenshot: true,
          })
        }
      />
    </>
  );
};
