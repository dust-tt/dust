import type { ExtensionWorkspaceType } from "@dust-tt/client";
import { InputBarContext } from "@extension/components/input_bar/InputBarContext";
// import { useCurrentUrlAndDomain } from "@extension/hooks/useCurrentDomain";
import type { FileUploaderService } from "@extension/hooks/useFileUploaderService";
import { usePlatform } from "@extension/shared/context/platform";
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
  const platform = usePlatform();

  const Buttons = platform.components.AttachButtons;

  return (
    <Buttons
      isBlinking={attachPageBlinking}
      isLoading={isLoading}
      fileUploaderService={fileUploaderService}
      owner={owner}
    />
  );
};
