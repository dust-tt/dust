import { z } from "zod";

export const MakeFrameDraftLiveRequestBodySchema = z.object({
  /** The draft publication the caller is showing, or got back from its draft publish. */
  draftPublicationId: z.string().min(1),
});

export type PostMakeFrameDraftLiveResponseBody = { publicationId: string };
