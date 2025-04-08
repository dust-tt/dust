import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthentication } from "@app/lib/api/auth_wrappers";
import { getPKCEConfig } from "@app/lib/utils/pkce";
import type { WithAPIErrorResponse } from "@app/types";

type PKCEResponse = {
  code_verifier: string;
  code_challenge: string;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PKCEResponse>>
) {
  const data = await getPKCEConfig();

  return res.status(200).json(data);
}

export default withSessionAuthentication(handler);
