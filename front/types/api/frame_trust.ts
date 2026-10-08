import { z } from "zod";

export type FrameTrustPublisher = {
  sId: string;
  fullName: string;
  image: string | null;
};

/**
 * Whether the viewer must trust the publisher of the Frame's active publication before it can
 * make tool calls on their behalf. `not_required` when it can't make any.
 */
export type FrameTrustState =
  | { status: "not_required" }
  | { status: "trusted" }
  | { status: "untrusted"; publisher: FrameTrustPublisher }
  | { status: "untrustable" };

export type GetFrameTrustResponseBody = {
  trust: FrameTrustState;
};

export const PostFrameTrustRequestBodySchema = z.object({
  // The publisher the viewer was shown. The grant fails if someone else has published since.
  publisherId: z.string(),
});

export type PostFrameTrustRequestBody = z.infer<
  typeof PostFrameTrustRequestBodySchema
>;
