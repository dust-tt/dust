import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";

export default async function handler(req, res) {
  const session = await unstable_getServerSession(req, res, authOptions);
  if (!session) {
    res.status(401);
  } else {
    switch (req.method) {
      case "GET":
        res.status(200).json({ apps: [] });
        break;
      case "POST":

        break;
      default:
        res.status(405);
        break;
    }
  }
}
