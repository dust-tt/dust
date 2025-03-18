import React, { useContext } from "react";

import type { PlatformService } from "../services/platform";

export const PlatformContext = React.createContext<PlatformService>(null!);

export const usePlatform = () => useContext(PlatformContext);
