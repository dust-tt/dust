import { NextApiRequest, NextApiResponse } from "next";
import {
  DatasourceSearchQuery,
  performSearch,
  DatasourceSearchResponseBody,
} from "@app/pages/api/data_sources/[user]/[name]/search";
import { auth_api_user } from "@app/lib/api/auth";
import { APIError } from "@app/lib/api/error";
import { User } from "@app/lib/models";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DatasourceSearchResponseBody | APIError>
) {
  let [authRes, dataSourceOwner] = await Promise.all([
    auth_api_user(req),
    User.findOne({
      where: {
        username: req.query.user,
      },
    }),
  ]);

  if (authRes.isErr()) {
    const err = authRes.error();
    return res.status(err.status_code).json(err.api_error);
  }
  const authUser = authRes.value();

  if (!dataSourceOwner) {
    res.status(404).json({
      error: {
        type: "user_not_found",
        message: "The user you're trying to query was not found.",
      },
    });
    return;
  }

  switch (req.method) {
    case "GET":
      // I could not find a way to make the query params be an array if there is only one tag
      if (req.query.tags_in && typeof req.query.tags_in === "string") {
        req.query.tags_in = [req.query.tags_in];
      }
      if (req.query.tags_not_in && typeof req.query.tags_not_in === "string") {
        req.query.tags_not_in = [req.query.tags_not_in];
      }
      const serach_result = await performSearch(
        authUser,
        dataSourceOwner,
        req.query.name as string,
        req.query
      );
      if (serach_result.isErr()) {
        const err = serach_result.error();
        res.status(err.status_code).json(err.api_error);
        return;
      } else {
        res.status(200).json(serach_result.value());
      }
      return;

    default:
      res.status(405).end();
      break;
  }
}
