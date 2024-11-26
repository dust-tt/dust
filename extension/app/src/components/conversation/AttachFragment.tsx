import { Button, CameraIcon, DocumentPlusIcon } from "@dust-tt/sparkle";
import { InputBarContext } from "@extension/components/input_bar/InputBarContext";
import type { FileUploaderService } from "@extension/hooks/useFileUploaderService";
import { useContext, useEffect } from "react";

type AttachFragmentProps = {
  fileUploaderService: FileUploaderService;
};

export const AttachFragment = ({
  fileUploaderService,
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

  return (
    <>
      <div className="block sm:hidden">
        <Button
          icon={DocumentPlusIcon}
          tooltip="Extract text from page and attach"
          variant="outline"
          size="sm"
          className={attachPageBlinking ? "animate-[bgblink_200ms_3]" : ""}
          onClick={() =>
            fileUploaderService.uploadContentTab({
              includeContent: true,
              includeCapture: false,
            })
          }
        />
      </div>
      <div className="block sm:hidden">
        <Button
          icon={CameraIcon}
          tooltip="Take page screenshot and attach"
          variant="outline"
          size="sm"
          onClick={() =>
            fileUploaderService.uploadContentTab({
              includeContent: false,
              includeCapture: true,
            })
          }
        />
      </div>
      <div className="hidden sm:block">
        <Button
          icon={DocumentPlusIcon}
          label="Add page text"
          tooltip="Extract text from page and attach"
          variant="outline"
          size="sm"
          className={attachPageBlinking ? "animate-[bgblink_200ms_3]" : ""}
          onClick={() =>
            fileUploaderService.uploadContentTab({
              includeContent: true,
              includeCapture: false,
            })
          }
        />
      </div>
      <div className="hidden sm:block">
        <Button
          icon={CameraIcon}
          label="Add page screenshot"
          tooltip="Take page screenshot and attach"
          variant="outline"
          size="sm"
          onClick={() =>
            fileUploaderService.uploadContentTab({
              includeContent: false,
              includeCapture: true,
            })
          }
        />
      </div>
    </>
  );
};
