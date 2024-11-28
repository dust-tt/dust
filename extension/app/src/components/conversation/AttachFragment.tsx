import { Button, CameraIcon, DocumentPlusIcon } from "@dust-tt/sparkle";
import { InputBarContext } from "@extension/components/input_bar/InputBarContext";
import type { FileUploaderService } from "@extension/hooks/useFileUploaderService";
import { useContext, useEffect } from "react";

type AttachFragmentProps = {
  fileUploaderService: FileUploaderService;
  isLoading: boolean;
};

export const AttachFragment = ({
  fileUploaderService,
  isLoading,
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
          tooltip="Attach text from page"
          variant="outline"
          size="sm"
          className={attachPageBlinking ? "animate-[bgblink_200ms_3]" : ""}
          onClick={() =>
            fileUploaderService.uploadContentTab({
              includeContent: true,
              includeCapture: false,
            })
          }
          disabled={isLoading}
        />
      </div>
      <div className="block sm:hidden">
        <Button
          icon={CameraIcon}
          tooltip="Attach page screenshot"
          variant="outline"
          size="sm"
          onClick={() =>
            fileUploaderService.uploadContentTab({
              includeContent: false,
              includeCapture: true,
            })
          }
          disabled={isLoading}
        />
      </div>
      <div className="hidden sm:block">
        <Button
          icon={DocumentPlusIcon}
          label="Add page text"
          tooltip="Attach text from page"
          variant="outline"
          size="sm"
          className={attachPageBlinking ? "animate-[bgblink_200ms_3]" : ""}
          onClick={() =>
            fileUploaderService.uploadContentTab({
              includeContent: true,
              includeCapture: false,
            })
          }
          disabled={isLoading}
        />
      </div>
      <div className="hidden sm:block">
        <Button
          icon={CameraIcon}
          label="Add page screenshot"
          tooltip="Attach page screenshot"
          variant="outline"
          size="sm"
          onClick={() =>
            fileUploaderService.uploadContentTab({
              includeContent: false,
              includeCapture: true,
            })
          }
          disabled={isLoading}
        />
      </div>
    </>
  );
};
