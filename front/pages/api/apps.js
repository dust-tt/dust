import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { User } from "../../lib/models";

export default async function handler(req, res) {
  const session = await unstable_getServerSession(req, res, authOptions);
  if (!session) {
    res.status(401);
  } else {
    switch (req.method) {
      case "GET":
        let user = await User.findOne({
          where: {
            github_id: session.github.id,
          },
        });
        if (!user) {
          res.status(401).end();
          break;
        }
        res.status(200).json({ apps: [] });
        break;
      case "POST":
        if (
          !req.body ||
          !(typeof req.body.name == "string") ||
          !(typeof req.body.description == "string") ||
          !["public", "private"].includes(req.body.visibility)
        ) {
          res.status(400).end();
          break;
        }

        console.log("Creating app");
        console.log(req.body);

        res.status(200).json({ message: "ok" });
        break;
      default:
        res.status(405).end();
        break;
    }
  }
}
