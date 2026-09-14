import { createContext, useContext } from "react";

const SheetViewportContext = createContext<HTMLDivElement | null>(null);

/**
 * Context provider exposing the scrollable viewport element of a `SheetContainer` to its
 * descendants. `SheetContainer` renders it automatically; provide it manually only when
 * building a custom sheet body whose children need the scroll viewport.
 *
 * @summary Provides the sheet scroll viewport element.
 */
export const SheetViewportProvider = SheetViewportContext.Provider;

/**
 * Returns the scrollable viewport element of the enclosing `SheetContainer`, or null when
 * not inside one (or before the viewport has mounted). Use it to observe or control
 * scrolling of the sheet body, e.g. for scroll-into-view or virtualized lists.
 *
 * @summary Hook returning the sheet scroll viewport.
 */
export function useSheetViewport(): HTMLDivElement | null {
  return useContext(SheetViewportContext);
}
