import { NextApiRequest, NextApiResponse } from "next";
import { setPreviewData, redirectToPreviewURL } from "@prismicio/next/pages";

import { createClient } from "../../cms/lib/prismicio";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const client = createClient({ req });

  setPreviewData({ req, res });

  return await redirectToPreviewURL({ req, res, client });
}
