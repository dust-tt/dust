import { Request, Response } from "express";

import {
  getDrivesIds,
  getFoldersToSync,
} from "@connectors/connectors/google_drive/temporal/activities";
import {
  Connector,
  GoogleDriveFolders,
  sequelize_conn,
} from "@connectors/lib/models";
import logger from "@connectors/logger/logger";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import { ConnectorsAPIErrorResponse } from "@connectors/types/errors";

type PostFoldersRes = { ok: string } | ConnectorsAPIErrorResponse;

const _googleDriveSetFoldersAPIHandler = async (
  req: Request<{ connector_id: string }, PostFoldersRes, { folders: string[] }>,
  res: Response<PostFoldersRes>
) => {
  if (!req.params.connector_id) {
    res.status(400).send({
      error: {
        message: `Missing required parameters. Required : connector_id`,
      },
    });

    return;
  }
  if (!req.body || !req.body.folders) {
    res.status(400).send({
      error: {
        message: `Missing required parameters. Required : folders `,
      },
    });

    return;
  }
  try {
    await sequelize_conn.transaction(async (t) => {
      await GoogleDriveFolders.destroy({
        where: {
          connectorId: req.params.connector_id,
        },
        transaction: t,
      });
      for (const folder of req.body.folders) {
        await GoogleDriveFolders.create(
          {
            connectorId: parseInt(req.params.connector_id),
            folderId: folder,
          },
          { transaction: t }
        );
      }
    });
  } catch (error) {
    logger.error(
      {
        error,
      },
      "Error while setting  Google Drive folders"
    );
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Error while setting  Google Drive folders`,
      },
    });
  }

  return res.status(200).send({ ok: "ok" });
};

export const googleDriveSetFoldersAPIHandler = withLogging(
  _googleDriveSetFoldersAPIHandler
);

type GetFoldersRes =
  | { id: string; name: string; selected: boolean }[]
  | ConnectorsAPIErrorResponse;

const _googleDriveGetFoldersAPIHandler = async (
  req: Request<{ connector_id: string }, GetFoldersRes, undefined>,
  res: Response<GetFoldersRes>
) => {
  if (!req.params.connector_id) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Missing required parameters. Required : connector_id`,
      },
    });
  }

  const connectorId = parseInt(req.params.connector_id);
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "invalid_request_error",
        message: `Connector not found`,
      },
    });
  }
  const selectedFolders = await getFoldersToSync(connectorId);
  const drives = await getDrivesIds(connector.nangoConnectionId);
  const folders = drives.map((drive) => {
    return {
      id: drive.id,
      name: drive.name,
      selected: selectedFolders.includes(drive.id),
    };
  });

  return res.status(200).send(folders);
};

export const googleDriveGetFoldersAPIHandler = withLogging(
  _googleDriveGetFoldersAPIHandler
);
