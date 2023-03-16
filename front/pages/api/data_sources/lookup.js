import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { User, DataSource } from "../../../lib/models";

export default async function handler(req, res) {
  const session = await unstable_getServerSession(req, res, authOptions);

  let dataSource = await DataSource.findOne({
    where: {
      name: req.query.data_source_id,
      dustAPIProjectId: req.query.project_id,
    },
  });

  if (!dataSource) {
    res.status(404).end();
    return;
  }

  let dataSourceUser = await User.findOne({
    where: {
      id: dataSource.userId,
    },
  });

  if (!dataSourceUser) {
    res.status(404).end();
    return;
  }

  const readOnly = !(
    session && session.provider.id.toString() === dataSourceUser.githubId
  );

  if (readOnly && dataSource.visibility !== "public") {
    res.status(404).end();
    return;
  }

  switch (req.method) {
    case "GET":
      res.status(200).json({
        dataSource,
        user: {
          username: dataSourceUser.username,
        },
      });
      break;

    default:
      res.status(405).end();
      break;
  }
}
