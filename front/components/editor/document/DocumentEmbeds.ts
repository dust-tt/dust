import type { DocumentProps } from "@app/components/editor/document/types";
import { createContext } from "react";

/** The host's renderers for the files a document references, read by their node views. */
export type DocumentEmbeds = Pick<DocumentProps, "renderFilePreview">;

export const DocumentEmbedsContext = createContext<DocumentEmbeds>({});
