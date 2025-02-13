import { Spinner } from "@dust-tt/sparkle";
import { FrontAttachButtons } from "@extension/front/components/AttachButtons";
import { useFrontContext } from "@extension/front/providers/FrontProvider";
import { FrontAuth } from "@extension/front/services/auth";
import { FrontCaptureService } from "@extension/front/services/capture";
import { FrontStorageService } from "@extension/front/storage";
import { PlatformContext } from "@extension/shared/context/platform";
import type { PlatformService } from "@extension/shared/services/platform";

export const FrontPlatformInitializer = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const frontContext = useFrontContext();

  if (!frontContext) {
    // Don't render anything if context is not available yet
    return <Spinner />;
  }

  const captureService = new FrontCaptureService(frontContext);

  const frontPlatform: PlatformService = {
    platform: "front",
    auth: new FrontAuth(),
    storage: new FrontStorageService(),
    components: {
      AttachButtons: FrontAttachButtons,
    },
    capture: captureService,
  };

  return (
    <PlatformContext.Provider value={frontPlatform}>
      {children}
    </PlatformContext.Provider>
  );
};
