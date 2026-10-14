import type { DocumentProps } from "@app/components/editor/document/types";
import { createContext } from "react";

/**
 * The host's renderers for the files a document references, read by their node views, and whether
 * the document can be edited, which TipTap does not tell node views when it changes.
 */
export type DocumentEmbeds = Pick<
  DocumentProps,
  "renderFrame" | "renderFilePreview"
> & { editable?: boolean };

export const DocumentEmbedsContext = createContext<DocumentEmbeds>({});
