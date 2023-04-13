import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { User, Workspace, Membership } from "@app/lib/models";
import { new_id } from "@app/lib/utils";
import withLogging from "@app/logger/withlogging";

async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    res.status(401).end();
    return;
  }

  switch (req.method) {
    case "GET":
      let user = await User.findOne({
        where: {
          githubId: session.provider.id.toString(),
        },
      });

      if (user) {
        user.username = session.user.username;
        user.email = session.user.email;
        user.name = session.user.name;
        await user.save();
      }
      if (!user) {
        let uId = new_id();

        const [u, w] = await Promise.all([
          User.create({
            githubId: session.provider.id.toString(),
            username: session.user.username,
            email: session.user.email,
            name: session.user.name,
          }),
          Workspace.create({
            uId,
            sId: uId.slice(0, 10),
            name: session.user.username,
            type: "personal",
          }),
        ]);

        const m = await Membership.create({
          role: "admin",
          userId: u.id,
          workspaceId: w.id,
        });
      }

      res.redirect(`/${session.user.username}`);
      return;

    default:
      res.status(405).end();
      return;
  }
}

export default withLogging(handler);
