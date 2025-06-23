import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { GetSlackChannelsLinkedWithAgentResponseBody } from "@app/lib/api/slack_channels_helpers";
import { handleSlackChannelsLinkedWithAgent } from "@app/lib/api/slack_channels_helpers";
import type { Authenticator } from "@app/lib/auth";
import type { WithAPIErrorResponse } from "@app/types";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetSlackChannelsLinkedWithAgentResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  return handleSlackChannelsLinkedWithAgent(req, res, auth, "slack");
}

export default withSessionAuthenticationForWorkspace(handler);
