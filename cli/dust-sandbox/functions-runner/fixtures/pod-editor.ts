import { z } from "zod";

export const schema = {
  description: "Refresh the pod cache",
  userIdentity: "pod_editor_required",
  input: z.object({}),
  output: z.object({ refreshed: z.boolean() }),
};

export default {
  async fetch(): Promise<Response> {
    return Response.json({ refreshed: true });
  },
};
