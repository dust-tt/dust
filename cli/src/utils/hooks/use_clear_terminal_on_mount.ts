import { useEffect } from "react";

export function useClearTerminalOnMount() {
  useEffect(() => {
    process.stdout.write("\x1bc");
  }, []);
}
