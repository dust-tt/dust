import { auth_user } from "@app/lib/auth";
import { Provider } from "@app/lib/models";
import withLogging from "@app/logger/withlogging";
import { ProviderType } from "@app/types/provider";
import { NextApiRequest, NextApiResponse } from "next";

export type PostProviderResponseBody = {
  provider: ProviderType;
};

export type DeleteProviderResponseBody = {
  provider: {
    providerId: string;
  };
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PostProviderResponseBody | DeleteProviderResponseBody>
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

  let [provider] = await Promise.all([
    Provider.findOne({
      where: {
        userId: auth.user().id,
        providerId: req.query.pId,
      },
    }),
  ]);

  if (!req.query.pId || typeof req.query.pId !== "string") {
    res.status(400).end();
    return;
  }

  switch (req.method) {
    case "POST":
      if (!req.body || !(typeof req.body.config == "string")) {
        res.status(400).end();
        return;
      }

      if (!provider) {
        provider = await Provider.create({
          providerId: req.query.pId,
          config: req.body.config,
          userId: auth.user().id,
        });
        res.status(201).json({
          provider: {
            providerId: provider.providerId,
            config: provider.config,
          },
        });
      } else {
        await provider.update({
          config: req.body.config,
        });
        res.status(200).json({
          provider: {
            providerId: provider.providerId,
            config: provider.config,
          },
        });
      }

      return;

    case "DELETE":
      if (!provider) {
        res.status(404).end();
        return;
      }

      await Provider.destroy({
        where: {
          userId: auth.user().id,
          providerId: req.query.pId,
        },
      });

      res.status(200).json({
        provider: {
          providerId: req.query.pId,
        },
      });
      return;

    default:
      res.status(405).end();
      return;
  }
}

export default withLogging(handler);
