import { NextApiRequest, NextApiResponse } from "next";
import { exitPreview } from "@prismicio/next/pages";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return exitPreview({ req, res });
}
