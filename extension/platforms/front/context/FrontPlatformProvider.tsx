import { Spinner } from "@dust-tt/sparkle";
import { useFrontContext } from "@extension/platforms/front/context/FrontProvider";
import { FrontPlatformService } from "@extension/platforms/front/services/platform";
import { PlatformProvider } from "@extension/shared/context/PlatformContext";
import { useMemo } from "react";

export const FrontPlatformProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const frontContext = useFrontContext();

  const platformService = useMemo(() => {
    if (!frontContext) {
      return null;
    }

    return new FrontPlatformService(frontContext);
  }, [frontContext]);

  if (!frontContext || !platformService) {
    return <Spinner />;
  }

  return (
    <PlatformProvider platformService={platformService}>
      {children}
    </PlatformProvider>
  );
};
