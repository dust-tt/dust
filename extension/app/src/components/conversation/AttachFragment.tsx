import {
  AttachmentIcon,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  useSendNotification,
} from "@dust-tt/sparkle";
import { supportedFileExtensions } from "@dust-tt/types";
import type { EditorService } from "@extension/components/input_bar/editor/useCustomEditor";
import type { FileUploaderService } from "@extension/hooks/useFileUploaderService";
import { getIncludeCurrentTab } from "@extension/lib/conversation";
import { useRef } from "react";

type AttachFragmentProps = {
  fileUploaderService: FileUploaderService;
  editorService: EditorService;
};

export const AttachFragment = ({
  fileUploaderService,
  editorService,
}: AttachFragmentProps) => {
  const sendNotification = useSendNotification();
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
            icon={AttachmentIcon}
            label={"Attach file"}
            onClick={async () => {
              fileInputRef.current?.click();
            }}
          />
          <DropdownMenuItem
            icon={AttachmentIcon}
            label={"Attach page content"}
            onClick={async () => {
              const tabContentRes = await getIncludeCurrentTab();

              if (tabContentRes && tabContentRes.isErr()) {
                sendNotification({
                  title: "Cannot get tab content",
                  description: tabContentRes.error.message,
                  type: "error",
                });
              }

              const tabContent =
                tabContentRes && tabContentRes.isOk()
                  ? tabContentRes.value
                  : null;

              if (tabContent && tabContent.content) {
                const file = new File(
                  [tabContent.content],
                  `${tabContent.title}.txt`,
                  {
                    type: "text/plain",
                  }
                );

                await fileUploaderService.handleFilesUpload([file]);
              }
            }}
          />
          <DropdownMenuItem
            icon={AttachmentIcon}
            label={"Attach page screenshot"}
            onClick={async () => {
              const tabContentRes = await getIncludeCurrentTab(false, true);

              if (tabContentRes && tabContentRes.isErr()) {
                sendNotification({
                  title: "Cannot get tab content",
                  description: tabContentRes.error.message,
                  type: "error",
                });
              }

              const tabContent =
                tabContentRes && tabContentRes.isOk()
                  ? tabContentRes.value
                  : null;

              if (tabContent && tabContent.screenshot) {
                console.log(tabContent.screenshot);
                const response = await fetch(tabContent.screenshot);
                const blob = await response.blob();
                const file = new File([blob], `${tabContent.title}.jpg`, {
                  type: blob.type,
                });

                await fileUploaderService.handleFilesUpload([file]);
              }
            }}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
