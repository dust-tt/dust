import type { DocumentImageOptions } from "@app/components/editor/document/DocumentImage";
import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * @cc [owner:tdraier,label:react] stable-image-source-resolver
 * The returned resolver MUST keep its identity for the component's lifetime, so editor
 * extensions built from it never rebuild the editor, and MUST call the latest
 * `resolveImageSource` the component rendered with.
 */
export function useImageSourceResolver(
  resolveImageSource: DocumentImageOptions["resolveSource"]
): DocumentImageOptions["resolveSource"] {
  const resolverRef = useRef(resolveImageSource);

  useLayoutEffect(() => {
    resolverRef.current = resolveImageSource;
  }, [resolveImageSource]);

  return useCallback((src: string) => resolverRef.current(src), []);
}
