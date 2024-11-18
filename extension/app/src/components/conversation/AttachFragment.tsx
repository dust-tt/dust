import { supportedFileExtensions } from "@dust-tt/client";
import {
  AttachmentIcon,
  Button,
  CameraIcon,
  DocumentTextIcon,
} from "@dust-tt/sparkle";
import type { EditorService } from "@extension/components/input_bar/editor/useCustomEditor";
import { InputBarContext } from "@extension/components/input_bar/InputBarContext";
import type { FileUploaderService } from "@extension/hooks/useFileUploaderService";
import { useContext, useEffect, useRef } from "react";

type AttachFragmentProps = {
  fileUploaderService: FileUploaderService;
  editorService: EditorService;
};

export const AttachFragment = ({
  fileUploaderService,
  editorService,
}: AttachFragmentProps) => {
  const { attachPageBlinking, setAttachPageBlinking } =
    useContext(InputBarContext);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (attachPageBlinking) {
      timer = setTimeout(() => {
        setAttachPageBlinking(false);
      }, 1000); // Reset after 1 second.
    }
    return () => clearTimeout(timer);
  }, [attachPageBlinking]);

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
        className={attachPageBlinking ? "animate-[bgblink_200ms_3]" : ""}
        onClick={() =>
          fileUploaderService.uploadContentTab({
            includeContent: true,
            includeScreenshot: false,
          })
        }
      />
      <Button
        icon={CameraIcon}
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
