import { NextApiRequest, NextApiResponse } from "next";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import { apiError } from "@app/logger/withlogging";
import { RegionLookupClient } from "@app/src/lib/lookup_api";
import { WithAPIErrorResponse } from "@dust-tt/types";

const UserSearchPostBodySchema = t.type({
  email: t.string,
  email_verified: t.boolean,
  sub: t.string,
});

export type UserSearchResponseBody = {
  success: boolean;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<UserSearchResponseBody>>,
) {
  const client = new RegionLookupClient("test", {
    "europe-west1": "https://api.eu.dust.tt",
    "us-central1": "https://api.us.dust.tt",
  });
  switch (req.method) {
    case "POST":
      const bodyValidation = UserSearchPostBodySchema.decode(req.body);
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }
      console.log("HEY");
      const result = await client.lookupUser(bodyValidation.right);
      console.log(result);
  }
  res.status(200).json({ success: true });
  return;
}
