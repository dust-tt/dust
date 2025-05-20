import { useEffect } from "react";

import { clearTerminal } from "../terminal.js";

export function useClearTerminalOnMount() {
  useEffect(() => {
    void clearTerminal();
  }, []);
}
