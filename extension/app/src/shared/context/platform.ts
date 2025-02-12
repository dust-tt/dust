import type { PlatformService } from "@extension/shared/services/platform";
import React, { useContext } from "react";

export const PlatformContext = React.createContext<PlatformService>(null!);

export const usePlatform = () => useContext(PlatformContext);
