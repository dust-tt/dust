import { createContext, useContext } from "react";

const SheetViewportContext = createContext<HTMLDivElement | null>(null);

export const SheetViewportProvider = SheetViewportContext.Provider;

export function useSheetViewport(): HTMLDivElement | null {
  return useContext(SheetViewportContext);
}
