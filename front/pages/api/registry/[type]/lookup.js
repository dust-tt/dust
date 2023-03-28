import { User, DataSource, Key } from "@app/lib/models";
import { Op } from "sequelize";

const { DUST_REGISTRY_SECRET } = process.env;

// Notes about the registry lookup service:
//
// For DataSources, we could proxy and modify on the fly the config before going to core and replace
// username/workspace by the internal dust project id but we'll need the same logic for code blocks
// to execute other dust apps and won't be able to modify on the fly the code, and will need to do
// it over API from core to front there, so we might as well handle this consistently.
//
// But that means we need to pass through the Dust UserId (in the future workspace) as header when
// going to core so that we can retrieve it here and check that the user has indeed access to the
// DataSource to prevent someone trying to access a DataSource by tweaking its API call config
//
// all of this creates an entanglement between core and front but only through this registry lookup
// service.
//
// Note: there is also a problem with private DataSources on public apps, the use of the registry
// here will prevent leaking them.

export default async function handler(req, res) {
  if (!req.headers.authorization) {
    res.status(401).end();
    return;
  }

  let parse = req.headers.authorization.match(/Bearer ([a-zA-Z0-9]+)/);
  if (!parse || !parse[1]) {
    res.status(401).end();
    return;
  }
  let secret = parse[1];

  if (secret !== DUST_REGISTRY_SECRET) {
    res.status(401).end();
    return;
  }

  if (!req.headers["x-dust-user-id"]) {
    res.status(400).end();
    return;
  }

  let dustUserId = parseInt(req.headers["x-dust-user-id"]);
  if (isNaN(dustUserId)) {
    res.status(400).end();
    return;
  }

  switch (req.method) {
    case "GET":
      switch (req.query.type) {
        case "data_sources":
          if (
            typeof req.query.username !== "string" ||
            typeof req.query.data_source_id !== "string"
          ) {
            res.status(400).end();
            return;
          }

          let [reqUser, dataSourceUser] = await Promise.all([
            User.findOne({
              where: {
                id: dustUserId,
              },
            }),
            User.findOne({
              where: {
                username: req.query.username,
              },
            }),
          ]);

          if (!reqUser || !dataSourceUser) {
            res.status(401).end();
            return;
          }

          const readOnly = dataSourceUser.id !== reqUser.id;

          let dataSource = await DataSource.findOne({
            where: readOnly
              ? {
                  userId: dataSourceUser.id,
                  name: req.query.data_source_id,
                  visibility: {
                    [Op.or]: ["public"],
                  },
                }
              : {
                  userId: dataSourceUser.id,
                  name: req.query.data_source_id,
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

          res.status(200).json({
            project_id: parseInt(dataSource.dustAPIProjectId),
            data_source_id: req.query.data_source_id,
          });
          return;

        default:
          res.status(405).end();
          return;
      }
      break;
    default:
      res.status(405).end();
      break;
  }
}
