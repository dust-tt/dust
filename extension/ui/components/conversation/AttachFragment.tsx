import type { ExtensionWorkspaceType } from "@dust-tt/client";
import { usePlatform } from "@extension/shared/context/PlatformContext";
import { InputBarContext } from "@extension/ui/components/input_bar/InputBarContext";
import type { FileUploaderService } from "@extension/ui/hooks/useFileUploaderService";
import { useContext, useEffect } from "react";

interface AttachFragmentProps {
  fileUploaderService: FileUploaderService;
  isLoading: boolean;
  owner: ExtensionWorkspaceType;
}

export const AttachFragment = ({
  owner,
  fileUploaderService,
  isLoading,
}: AttachFragmentProps) => {
  const platform = usePlatform();

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

  const CaptureActionsComponent = platform.getCaptureActionsComponent();

  if (!CaptureActionsComponent) {
    return null;
  }

  return (
    <div className="flex flex-row">
      <CaptureActionsComponent
        fileUploaderService={fileUploaderService}
        isBlinking={attachPageBlinking}
        isLoading={isLoading}
        owner={owner}
      />
    </div>
  );
};
