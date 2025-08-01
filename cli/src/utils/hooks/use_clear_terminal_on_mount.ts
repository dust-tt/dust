import { useEffect, useState } from "react";

import { clearTerminal } from "../terminal.js";

export function useClearTerminalOnMount() {
  const [isCleared, setIsCleared] = useState(false);

  useEffect(() => {
    void clearTerminal();
    setIsCleared(true);
  }, []);

  return isCleared;
}
