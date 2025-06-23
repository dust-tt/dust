import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { WithAPIErrorResponse } from "@app/types";

import type { GetSlackChannelsLinkedWithAgentResponseBody } from "../slack/channels_linked_with_agent";
import { handleSlackChannelsLinkedWithAgent } from "../slack/channels_linked_with_agent";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetSlackChannelsLinkedWithAgentResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  return handleSlackChannelsLinkedWithAgent(req, res, auth, "slack_bot");
}

export default withSessionAuthenticationForWorkspace(handler);
