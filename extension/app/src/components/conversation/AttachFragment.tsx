import { supportedFileExtensions } from "@dust-tt/client";
import {
  AttachmentIcon,
  Button,
  DocumentIcon,
  DocumentTextIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            icon={AttachmentIcon}
            variant="ghost"
            isSelect
            size="xs"
            tooltip="Pick an assistant"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-[300px]">
          <DropdownMenuItem
            icon={DocumentIcon}
            label={"Attach file"}
            onClick={async () => {
              fileInputRef.current?.click();
            }}
          />
          <DropdownMenuItem
            icon={DocumentTextIcon}
            label={"Attach page content"}
            onClick={() => fileUploaderService.uploadContentTab()}
          />
          <DropdownMenuItem
            icon={ImageIcon}
            label={"Attach page screenshot"}
            onClick={() => fileUploaderService.uploadContentTabAsScreenshot()}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
