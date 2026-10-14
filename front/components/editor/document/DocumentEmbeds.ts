import type { DocumentFrameMenuProps } from "@app/components/editor/document/DocumentFrameMenu";
import type { DocumentProps } from "@app/components/editor/document/types";
import type { ReactNode } from "react";
import { createContext } from "react";

/**
 * The host's renderers for the files a document references, read by their node views, and the
 * Frame menu while the document can be edited, which TipTap does not tell node views when it
 * changes. The editor provides the menu so that the schema, which the collab server bundles, does
 * not import the design system.
 */
export type DocumentEmbeds = Pick<
  DocumentProps,
  "renderFrame" | "renderFilePreview"
> & { renderFrameMenu?: (props: DocumentFrameMenuProps) => ReactNode };

export const DocumentEmbedsContext = createContext<DocumentEmbeds>({});
