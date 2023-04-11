import { auth_user } from "@app/lib/auth";
import { Provider } from "@app/lib/models";
import withLogging from "@app/logger/withlogging";
import { ProviderType } from "@app/types/provider";
import { NextApiRequest, NextApiResponse } from "next";

export type GetProvidersResponseBody = {
  providers: ProviderType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetProvidersResponseBody>
): Promise<void> {
  let authRes = await auth_user(req, res);

  if (authRes.isErr()) {
    res.status(authRes.error.status_code).end();
    return;
  }
  let auth = authRes.value;

  if (auth.isAnonymous()) {
    res.status(401).end();
    return;
  }

  switch (req.method) {
    case "GET":
      let providers = await Provider.findAll({
        where: {
          userId: auth.user().id,
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
