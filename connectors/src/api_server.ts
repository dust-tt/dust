import bodyParser from "body-parser";
import express, { Request, Response } from "express";

import { createSlackConnector } from "./connectors/slack/slack";

const app = express();
app.use(bodyParser.json());
const port = process.env.API_PORT ? parseInt(process.env.API_PORT, 10) : 3002;

type ConnectorCreateReqBody = {
  APIKey: string;
  dataSourceName: string;
  workspaceId: string;
  nangoConnectionId: string;
};

type ConnectorCreateResBody = { connectorId: string } | string;

app.post(
  "/connectors/create/:connector_provider",
  async (
    req: Request<
      { connector_provider: string },
      ConnectorCreateResBody,
      ConnectorCreateReqBody
    >,
    res: Response<ConnectorCreateResBody>
  ) => {
    try {
      if (
        !req.body.APIKey ||
        !req.body.dataSourceName ||
        !req.body.workspaceId ||
        !req.body.nangoConnectionId
      ) {
        // We would probably want to return the same error inteface than we use in the /front package. TBD.
        res
          .status(400)
          .send(
            `Missing required parameters. Required : APIKey, dataSourceName, workspaceId, nangoConnectionId`
          );
        return;
      }
      const conncetorRes = await createSlackConnector(
        {
          APIKey: req.body.APIKey,
          dataSourceName: req.body.dataSourceName,
          workspaceId: req.body.workspaceId,
        },
        req.body.nangoConnectionId
      );
      if (conncetorRes.isErr()) {
        res.status(500).send(conncetorRes.error.message);
        return;
      }

      return res.status(200).send({
        connectorId: conncetorRes.value,
      });
    } catch (e) {
      console.error(e);
      return res.status(500).send("Could not create the connector");
    }
  }
);

app.listen(port, () => {
  console.log(`Connectors API listening on port ${port}`);
});
