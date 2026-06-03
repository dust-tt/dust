import type { PaletteActionConfig } from "@app/components/command_palette/CommandPaletteContext";
import { useCommandPaletteOptional } from "@app/components/command_palette/CommandPaletteContext";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

interface UsePaletteActionInput extends PaletteActionConfig {
  enabled?: boolean;
}

// Low-level primitive. Prefer the <PaletteAction> wrapper; reach for this hook only
// when there is no DOM element to wrap. No-ops outside a CommandPaletteProvider.
export function usePaletteAction({
  enabled = true,
  ...action
}: UsePaletteActionInput) {
  const palette = useCommandPaletteOptional();
  const registerAction = palette?.registerAction;
  const unregisterAction = palette?.unregisterAction;

  // Read the handler from a ref so a new closure doesn't re-register every render.
  const onSelectRef = useRef(action.onSelect);
  onSelectRef.current = action.onSelect;

  const { id, label, description, icon } = action;

  useEffect(() => {
    if (!enabled || !registerAction || !unregisterAction) {
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
  }, [registerAction, unregisterAction, enabled, id, label, description, icon]);
}

interface PaletteActionProps extends Omit<PaletteActionConfig, "onSelect"> {
  children: ReactNode;
  enabled?: boolean;
  onSelect?: () => void;
}

// Wrap the button you already render to also expose it in the command palette.
// By default, selecting it forwards a click to the wrapped element, so the handler
// is never declared twice; pass `onSelect` to override.
export function PaletteAction({
  children,
  enabled,
  onSelect,
  ...config
}: PaletteActionProps) {
  const containerRef = useRef<HTMLSpanElement>(null);

  usePaletteAction({
    ...config,
    enabled,
    onSelect:
      onSelect ??
      (() => {
        const trigger = containerRef.current?.querySelector<HTMLElement>(
          'button, a[href], [role="button"]'
        );
        trigger?.click();
      }),
  });

  // `display: contents` keeps the wrapper out of the layout.
  return (
    <span ref={containerRef} style={{ display: "contents" }}>
      {children}
    </span>
  );
}
