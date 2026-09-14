import { useCellContext } from "@app/lib/auth/CellContext";
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
  const { cells } = useCellContext();

  const platformService = useMemo(() => {
    if (!frontContext) {
      return null;
    }

    return new FrontPlatformService(frontContext, cells);
  }, [frontContext, cells]);

  if (!frontContext || !platformService) {
    return <Spinner />;
  }

  return (
    <PlatformProvider platformService={platformService}>
      {children}
    </PlatformProvider>
  );
};
