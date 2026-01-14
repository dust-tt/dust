import { SLIDESHOW_INSTRUCTIONS } from "./instructions";

// =============================================================================
// Server Info - Server metadata for the constants registry
// =============================================================================

export const SLIDESHOW_SERVER_INFO = {
  name: "slideshow" as const,
  version: "0.1.0",
  description: "Create interactive slideshows.",
  authorization: null,
  icon: "ActionDocumentTextIcon" as const,
  documentationUrl: null,
  instructions: SLIDESHOW_INSTRUCTIONS,
};
