import { useCommandPaletteOptional } from "@app/components/command_palette/CommandPaletteContext";
import type { PaletteActionConfig } from "@app/components/command_palette/types";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

// Registers a command in the palette for as long as the calling component is mounted.
// The handler is read from a ref so it always reflects the latest closure without
// forcing a re-registration on every render.
// No-ops when rendered outside a CommandPaletteProvider.
export function usePaletteAction(action: PaletteActionConfig) {
  const palette = useCommandPaletteOptional();
  const registerAction = palette?.registerAction;
  const unregisterAction = palette?.unregisterAction;

  const onSelectRef = useRef(action.onSelect);
  onSelectRef.current = action.onSelect;

  const { id, label, description, icon } = action;

  useEffect(() => {
    if (!registerAction || !unregisterAction) {
      return;
    }
    registerAction({
      id,
      label,
      description,
      icon,
      onSelect: () => onSelectRef.current(),
    });
    return () => unregisterAction(id);
  }, [registerAction, unregisterAction, id, label, description, icon]);
}

interface PaletteActionProps extends PaletteActionConfig {
  children?: ReactNode;
}

// Wraps a visible button (or any node) and registers its action in the command palette.
// Renders children verbatim, so it never affects page layout. Can also be used headless
// (no children) to register an action whose trigger lives elsewhere.
export function PaletteAction({ children, ...config }: PaletteActionProps) {
  usePaletteAction(config);
  return <>{children}</>;
}
