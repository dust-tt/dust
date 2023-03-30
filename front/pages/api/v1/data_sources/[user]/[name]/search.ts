import { NextApiRequest, NextApiResponse } from "next";
import {
  DatasourceSearchQuery,
  performSearch,
  DatasourceSearchResponseBody,
} from "@app/pages/api/data_sources/[user]/[name]/search";
import { require_api_user } from "@app/lib/http_utils";
import { ApiError } from "@app/lib/api_models";
import { User, DataSource, Provider, Key } from "@app/lib/models";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DatasourceSearchResponseBody | ApiError>
) {
  const auth_result = await require_api_user(req);
  if (auth_result.isErr()) {
    const err = auth_result.error();
    res.status(err.status_code).json(err.api_error);
    return;
  }
  let auth_user = await User.findOne({
    where: {
      id: auth_result.value(),
    },
  });

  if (!auth_user) {
    res.status(404).end();
    return;
  }
  let request_uri_user = await User.findOne({
    where: {
      username: req.query.user,
    },
  });

  if (!request_uri_user) {
    res.status(404).end();
    return;
  }

  switch (req.method) {
    case "POST":
      const serach_result = await performSearch(
        auth_user,
        request_uri_user,
        req.query.name as string,
        req.body
      );
      if (serach_result.isErr()) {
        const err = serach_result.error();
        res.status(err.status_code).json(err.api_error);
        return;
      } else {
        res.status(200).json(serach_result.value());
      }
      return;
  }
}
