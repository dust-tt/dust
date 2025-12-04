import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";
import { isString } from "@app/types";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { secret, slug } = req.query;

  if (secret !== config.getContentfulPreviewSecret()) {
    return res.status(401).json({ message: "Invalid token" });
  }

  if (!isString(slug)) {
    return res
      .status(400)
      .json({ message: "Missing or invalid slug parameter" });
  }

  res.setPreviewData({ slug }, { maxAge: 60 * 60 });
  res.redirect(`/blog/${slug}`);
}
