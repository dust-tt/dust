import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]";
import { User, App, Clone, Dataset } from "../../../../../lib/models";
import { new_id } from "../../../../../lib/utils";

const { DUST_API } = process.env;

export default async function handler(req, res) {
  const session = await unstable_getServerSession(req, res, authOptions);

  let [user, cloneFromUser] = await Promise.all([
    User.findOne({
      where: {
        username: session.user.username,
      },
    }),
    User.findOne({
      where: {
        username: req.query.user,
      },
    }),
  ]);

  if (!cloneFromUser) {
    res.status(404).end();
    return;
  }

  if (!session || !user) {
    res.status(401).end();
    return;
  }

  if (session.github.id.toString() === cloneFromUser.githubId) {
    res.status(403).end();
    return;
  }

  let [cloneFromApp] = await Promise.all([
    App.findOne({
      where: {
        userId: cloneFromUser.id,
        sId: req.query.sId,
      },
    }),
  ]);

  if (!cloneFromApp) {
    res.status(404).end();
    return;
  }

  let [cloneFromDatasets] = await Promise.all([
    Dataset.findAll({
      where: {
        userId: cloneFromUser.id,
        appId: cloneFromApp.id,
      },
      order: [["updatedAt", "DESC"]],
    }),
  ]);

  // console.log("cloneFromUser", cloneFromUser);
  // console.log("cloneFromApp", cloneFromApp);
  console.log("cloneFromDatasets", cloneFromDatasets);
  // console.log("session", session);

  switch (req.method) {
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

      const r = await fetch(
        `${DUST_API}/projects/${cloneFromApp.dustAPIProjectId}/clone`,
        {
          method: "POST",
        }
      );
      const p = await r.json();
      if (p.error) {
        res.status(500).end();
        break;
      }

      let description = req.body.description ? req.body.description : null;
      let uId = new_id();

      let [app] = await Promise.all([
        App.create({
          uId,
          sId: uId.slice(0, 10),
          name: req.body.name,
          description,
          visibility: req.body.visibility,
          userId: user.id,
          dustAPIProjectId: p.response.project.project_id,
          savedSpecification: cloneFromApp.savedSpecification,
        }),
      ]);

      let promises = cloneFromDatasets.map((d) => {
        return Dataset.create({
          name: d.name,
          description: d.description,
          userId: user.id,
          appId: app.id,
        });
      });
      promises.push(
        Clone.create({
          fromId: cloneFromApp.id,
          toId: app.id,
        })
      );
      await Promise.all(promises);

      res.redirect(`/${session.user.username}/a/${app.sId}`);
      break;

    default:
      res.status(405).end();
      break;
  }
}
