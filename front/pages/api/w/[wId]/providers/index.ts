import { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import { Provider } from "@app/lib/models";
import { withLogging } from "@app/logger/withlogging";
import { ProviderType } from "@app/types/provider";

export type GetProvidersResponseBody = {
  providers: ProviderType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetProvidersResponseBody>
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  if (!owner) {
    res.status(404).end();
    return;
  }

  if (!auth.isBuilder()) {
    res.status(401).end();
    return;
  }

  switch (req.method) {
    case "GET":
      let providers = await Provider.findAll({
        where: {
          workspaceId: owner.id,
        },
      });

      res.status(200).json({
        providers: providers.map((p) => {
          return {
            providerId: p.providerId,
            config: p.config,
          };
        }),
      });
      return;

    default:
      res.status(405).end();
      return;
  }
}

export default withLogging(handler);
