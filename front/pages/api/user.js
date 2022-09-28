import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { DustUser } from "../../lib/models/user";

export default async function handler(req, res) {
  const session = await unstable_getServerSession(req, res, authOptions);
  console.log(session);

  if (!session) {
    res.status(401);
  } else {
    switch (req.method) {
      case "GET":
        res.status(200).json({ user: "user" });
        break;
      default:
        res.status(405);
        break;
    }
  }
}
