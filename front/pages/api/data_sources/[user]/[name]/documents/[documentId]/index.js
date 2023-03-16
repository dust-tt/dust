import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "../../../../../auth/[...nextauth]";
import { User, DataSource, Provider } from "../../../../../../../lib/models";
import { Op } from "sequelize";
import { credentialsFromProviders } from "../../../../../../../lib/providers";

const { DUST_API } = process.env;

export default async function handler(req, res) {
  const session = await unstable_getServerSession(req, res, authOptions);

  let user = await User.findOne({
    where: {
      username: req.query.user,
    },
  });

  if (!user) {
    res.status(404).end();
    return;
  }

  const readOnly = !(
    session && session.provider.id.toString() === user.githubId
  );

  let dataSource = await DataSource.findOne({
    where: readOnly
      ? {
          userId: user.id,
          name: req.query.name,
          visibility: {
            [Op.or]: ["public"],
          },
        }
      : {
          userId: user.id,
          name: req.query.name,
        },
    attributes: [
      "id",
      "name",
      "description",
      "visibility",
      "config",
      "dustAPIProjectId",
      "updatedAt",
    ],
  });

  if (!dataSource) {
    res.status(404).end();
    return;
  }

  let documentId = req.query.documentId;
  if (!documentId) {
    res.status(400).end();
    return;
  }

  switch (req.method) {
    case "POST":
      if (readOnly) {
        res.status(401).end();
        break;
      }

      let [providers] = await Promise.all([
        Provider.findAll({
          where: {
            userId: user.id,
          },
        }),
      ]);

      if (!req.body || !(typeof req.body.text == "string")) {
        res.status(400).end();
        break;
      }

      // Enforce FreePlan limit: 32 documents per DataSource.
      const documentsRes = await fetch(
        `${DUST_API}/projects/${dataSource.dustAPIProjectId}/data_sources/${dataSource.name}/documents?limit=1&offset=0`,
        {
          method: "GET",
        }
      );
      if (!documentsRes.ok) {
        const error = await documentsRes.json();
        res.status(400).json(error.error);
        break;
      }
      const documents = await documentsRes.json();
      if (documents.response.total >= 32) {
        res.status(400).end();
        break;
      }

      // Enforce FreePlan limit: 1MB per document.
      if (req.body.text.length > 1024 * 1024) {
        res.status(400).end();
        break;
      }

      let credentials = credentialsFromProviders(providers);

      // Create document with the Dust internal API.
      const upsertRes = await fetch(
        `${DUST_API}/projects/${dataSource.dustAPIProjectId}/data_sources/${dataSource.name}/documents`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            document_id: documentId,
            tags: [],
            text: req.body.text,
            credentials,
          }),
        }
      );

      const data = await upsertRes.json();

      if (data.error) {
        res.status(500).end();
        break;
      }

      res.redirect(`/${session.user.username}/data_sources/${dataSource.name}`);

      break;

    case "GET":
      const documentRes = await fetch(
        `${DUST_API}/projects/${dataSource.dustAPIProjectId}/data_sources/${dataSource.name}/documents/${documentId}`,
        {
          method: "GET",
        }
      );

      if (!documentRes.ok) {
        const error = await documentRes.json();
        res.status(400).json(error.error);
        break;
      }

      const document = await documentRes.json();

      res.status(200).json({
        document: document.response.document,
        text: document.response.text,
      });
      break;

    case "DELETE":
      const delRes = await fetch(
        `${DUST_API}/projects/${dataSource.dustAPIProjectId}/data_sources/${dataSource.name}/documents/${documentId}`,
        {
          method: "DELETE",
        }
      );

      if (!delRes.ok) {
        const error = await delRes.json();
        res.status(400).json(error.error);
        break;
      }

      res.status(200).json({
        document: {
          document_id: documentId,
        },
      });
      break;

    default:
      res.status(405).end();
      break;
  }
}
