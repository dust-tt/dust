import withLogging from "@app/logger/withlogging";
import { DataSourceType } from "@app/types/data_source";
import { NextApiRequest, NextApiResponse } from "next";

const { NANGO_SECRET_KEY, NANGO_SLACK_CONNECTOR_ID } = process.env;

export type GetDataSourcesResponseBody = {
  dataSources: Array<DataSourceType>;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  switch (req.method) {
    case "POST": {
      // console.log(req.body)
      // console.log(await run());
      res.status(200).send({ a: "b" });

      return;
    }
    default:
      res.status(405).end();
      return;
  }
}

export default withLogging(handler);
