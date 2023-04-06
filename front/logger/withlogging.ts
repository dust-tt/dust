import { NextApiRequest, NextApiResponse } from "next";
import logger from "./logger";

const withLogging = (handler: any) => {
  return async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
    let now = new Date();
    let output = await handler(req, res);
    let elapsed = new Date().getTime() - now.getTime();

    logger.info(
      {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration: `${elapsed} ms`,
      },
      "Processed request"
    );
    return output;
  };
};

export default withLogging;
