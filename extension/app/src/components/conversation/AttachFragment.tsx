import type { ExtensionWorkspaceType } from "@dust-tt/client";
import { Button, CameraIcon, DocumentPlusIcon } from "@dust-tt/sparkle";
import { InputBarContext } from "@extension/components/input_bar/InputBarContext";
import { useCurrentDomain } from "@extension/hooks/useCurrentDomain";
import type { FileUploaderService } from "@extension/hooks/useFileUploaderService";
import { useContext, useEffect } from "react";

type AttachFragmentProps = {
  owner: ExtensionWorkspaceType;
  fileUploaderService: FileUploaderService;
  isLoading: boolean;
};

export const AttachFragment = ({
  owner,
  fileUploaderService,
  isLoading,
}: AttachFragmentProps) => {
  // Blinking animation.
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

  // Blacklisting logic to disable share buttons.
  const currentDomain = useCurrentDomain();
  const blacklistedDomains: string[] = owner.blacklistedDomains ?? [];
  const isBlacklisted =
    currentDomain === "chrome" ||
    blacklistedDomains.some((d) => currentDomain.endsWith(d));

  return (
    <>
      <div className="block sm:hidden">
        <Button
          icon={DocumentPlusIcon}
          tooltip={
            !isBlacklisted
              ? "Attach text from page"
              : "Attachment disabled on this website"
          }
          variant="outline"
          size="sm"
          className={attachPageBlinking ? "animate-[bgblink_200ms_3]" : ""}
          onClick={() =>
            fileUploaderService.uploadContentTab({
              includeContent: true,
              includeCapture: false,
            })
          }
          disabled={isLoading || isBlacklisted}
        />
      </div>
      <div className="block sm:hidden">
        <Button
          icon={CameraIcon}
          tooltip={
            !isBlacklisted
              ? "Attach page screenshot"
              : "Attachment disabled on this website"
          }
          variant="outline"
          size="sm"
          onClick={() =>
            fileUploaderService.uploadContentTab({
              includeContent: false,
              includeCapture: true,
            })
          }
          disabled={isLoading || isBlacklisted}
        />
      </div>
      <div className="hidden sm:block">
        <Button
          icon={DocumentPlusIcon}
          label="Add page text"
          tooltip={
            !isBlacklisted
              ? "Attach text from page"
              : "Attachment disabled on this website"
          }
          variant="outline"
          size="sm"
          className={attachPageBlinking ? "animate-[bgblink_200ms_3]" : ""}
          onClick={() =>
            fileUploaderService.uploadContentTab({
              includeContent: true,
              includeCapture: false,
            })
          }
          disabled={isLoading || isBlacklisted}
        />
      </div>
      <div className="hidden sm:block">
        <Button
          icon={CameraIcon}
          label="Add page screenshot"
          tooltip={
            !isBlacklisted
              ? "Attach page screenshot"
              : "Attachment disabled on this website"
          }
          variant="outline"
          size="sm"
          onClick={() =>
            fileUploaderService.uploadContentTab({
              includeContent: false,
              includeCapture: true,
            })
          }
          disabled={isLoading || isBlacklisted}
        />
      </div>
    </>
  );
};
