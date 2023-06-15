import { Request, Response } from "express";
import { GaxiosResponse } from "gaxios";
import { drive_v3 } from "googleapis";

import {
  getDriveClient,
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
import { GoogleDriveSelectedFolderType } from "@connectors/types/google_drive";

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

      await Promise.all(
        req.body.folders.map(async (folder) => {
          await GoogleDriveFolders.create(
            {
              connectorId: parseInt(req.params.connector_id),
              folderId: folder,
            },
            { transaction: t }
          );
        })
      );
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
  | GoogleDriveSelectedFolderType[]
  | ConnectorsAPIErrorResponse;

// This endpoint returns the list of all folders in the user's Google Drive (only the shared drives for now).
// The list is returned as a flat list of nodes with their parents and children property filled out.
// The Google Drive API only allows you to list objects, and getting the full path of a file requires
// to make an API call for each parent. That means that we rely on the fact that Google Drive
// is going to ultimately send us all the folders at some point when listing them to have the full path of each folder
// defined. Otherwise, the behavior is undefined.
// The local compute time complexity of this function is N^2, with N being the number of folders.
// The API call complexity is O(N) with N being the number of folders.
const _googleDriveGetFoldersAPIHandler = async (
  req: Request<
    { connector_id: string; parentId?: string },
    GetFoldersRes,
    undefined
  >,
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
  const driveClient = await getDriveClient(connector.connectionId);
  const drives = await getDrivesIds(connector.connectionId);
  const folders: GoogleDriveSelectedFolderType[] = [];
  for (const drive of drives) {
    folders.push({
      id: drive.id,
      name: drive.name,
      parent: null,
      children: [],
      selected: selectedFolders.includes(drive.id),
    });
  }
  let nextPageToken: string | undefined = undefined;

  do {
    const filesRes: GaxiosResponse<drive_v3.Schema$FileList> =
      await driveClient.files.list({
        fields: "files(id, name, parents, teamDriveId), nextPageToken",

        q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        corpora: "allDrives",
        pageToken: nextPageToken,
        pageSize: 1000,
      });

    if (filesRes.status !== 200) {
      return apiError(req, res, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Error while getting Google Drive folders. status: ${filesRes.status} statusText: ${filesRes.statusText}`,
        },
      });
    }
    if (!filesRes.data.files) {
      return apiError(req, res, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Error while getting Google Drive folders. No files in response`,
        },
      });
    }
    for (const file of filesRes.data.files) {
      if (!file.parents || file.parents.length === 0) {
        continue;
      }
      if (file.id && file.name) {
        folders.push({
          id: file.id,
          name: file.name,
          parent: file.parents ? (file.parents[0] as string) : null,
          // children are computed once we have the full list of nodes.
          children: [],
          selected: selectedFolders.includes(file.id),
        });
      }
    }
    nextPageToken = filesRes.data.nextPageToken
      ? filesRes.data.nextPageToken
      : undefined;
  } while (nextPageToken);

  // filling out the children property for each node.
  // complexity is N^2, with N being the number of folders.
  folders.forEach((currentNode) => {
    const directChildren = folders.filter((f) => f.parent === currentNode.id);
    currentNode.children = directChildren.map((f) => f.id);
  });

  return res.status(200).send(folders);
};

export const googleDriveGetFoldersAPIHandler = withLogging(
  _googleDriveGetFoldersAPIHandler
);
