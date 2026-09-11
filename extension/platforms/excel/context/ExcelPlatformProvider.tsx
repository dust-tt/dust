import { useCellContext } from "@app/lib/auth/CellContext";
import { ExcelPlatformService } from "@extension/platforms/excel/services/platform";
import { PlatformProvider } from "@extension/shared/context/PlatformContext";
import { useMemo } from "react";

export const ExcelPlatformProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { cells } = useCellContext();

  const platformService = useMemo(
    () => new ExcelPlatformService(cells),
    [cells]
  );

  return (
    <PlatformProvider platformService={platformService}>
      {children}
    </PlatformProvider>
  );
};
