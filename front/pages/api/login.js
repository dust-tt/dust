import { unstable_getServerSession } from "next-auth/next";
import { authOptions, adapter } from "./auth/[...nextauth]";
import { User } from "../../lib/models";

export default async function handler(req, res) {
  const session = await unstable_getServerSession(req, res, authOptions);
  console.log("USER API");
  console.log(session);

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

        if (user) {
          user.username = session.user.username;
          user.email = session.user.email;
          user.name = session.user.name;
          await user.save();
        }
        if (!user) {
          user = await User.create({
            github_id: session.github.id,
            username: session.user.username,
            email: session.user.email,
            name: session.user.name,
          });
        }

        res.redirect(`/${session.user.username}`);
        break;
      default:
        res.status(405);
        break;
    }
  }
}
