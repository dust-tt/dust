import bodyParser from "body-parser";
import express, { Request, Response } from "express";

import { createSlackConnector } from "./connectors/slack/slack";

const app = express();
app.use(bodyParser.json());
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3002;

interface ConnectorCreateReqBody {
  APIKey: string;
  dataSourceName: string;
  workspaceId: string;
  nangoConnectionId: string;
}

app.post(
  "/connectors/create/:connector_provider",
  async (
    req: Request<{ connector_provider: string }, any, ConnectorCreateReqBody>,
    res: Response<{ connectorId: string } | string>
  ) => {
    try {
      if (
        !req.body.APIKey ||
        !req.body.dataSourceName ||
        !req.body.workspaceId ||
        !req.body.nangoConnectionId
      ) {
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
  console.log(`Example app listening on port ${port}`);
});
