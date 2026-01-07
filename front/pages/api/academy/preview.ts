import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";
import { isString } from "@app/types";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { secret, slug, type } = req.query;

  if (secret !== config.getContentfulPreviewSecret()) {
    return res.status(401).json({ message: "Invalid token" });
  }

  if (!isString(slug)) {
    return res
      .status(400)
      .json({ message: "Missing or invalid slug parameter" });
  }

  if (!isString(type) || !["course", "lesson"].includes(type)) {
    return res
      .status(400)
      .json({ message: "Missing or invalid type parameter (course or lesson)" });
  }

  res.setPreviewData({ slug }, { maxAge: 60 * 60 });

  if (type === "lesson") {
    res.redirect(`/academy/lessons/${slug}`);
  } else {
    res.redirect(`/academy/${slug}`);
  }
}
