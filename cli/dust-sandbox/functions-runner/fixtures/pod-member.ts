import { z } from "zod";

export const schema = {
  description: "List the pod's open tasks",
  userIdentity: "pod_member_required",
  input: z.object({}),
  output: z.object({ tasks: z.array(z.string()) }),
};

export default {
  async fetch(): Promise<Response> {
    return Response.json({ tasks: [] });
  },
};
