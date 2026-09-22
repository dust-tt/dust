"use client";

import { DocumentThemeSchema } from "@dust-tt/sparkle/dist/esm/components/Document/DocumentTheme";
import type { DocumentVisualReference } from "@dust-tt/sparkle/dist/esm/components/Document/DocumentVisual";
import { cn } from "@viz/lib/utils";
import { type ReactNode, useCallback } from "react";
import { DocumentFile } from "./DocumentFile";

export interface DocumentRootProps {
  /** One native file containing the complete document. */
  src: string;
  /** Shared presentation tokens, typically imported from a package theme file. */
  theme?: unknown;
  /** Model-authored React visuals indexed by the names stored in the document. */
  visuals?: Record<string, ReactNode>;
  className?: string;
}

/**
 * One themed editor inside the Frame. Content and visual references save together.
 * @summary File-backed document with a shared theme and named React visuals.
 */
export const DocumentRoot = ({
  src,
  theme,
  visuals,
  className,
}: DocumentRootProps) => {
  const parsedTheme = DocumentThemeSchema.safeParse(theme ?? {});
  const renderVisual = useCallback(
    ({ name }: DocumentVisualReference) =>
      visuals && Object.hasOwn(visuals, name) ? visuals[name] : null,
    [visuals]
  );

  return (
    <>
      {!parsedTheme.success && (
        <p role="alert" className="p-4 text-sm">
          This document theme is invalid. The default appearance is shown.
        </p>
      )}
      <DocumentFile
        src={src}
        className={cn("min-h-screen", className)}
        theme={parsedTheme.success ? parsedTheme.data : undefined}
        renderVisual={renderVisual}
      />
    </>
  );
};
