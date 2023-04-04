import logger from "./logger";

const withLogging = (handler) => {
    return async (req, res) => {
      logger.info(req);
      let output = await handler(req, res);
      logger.info(res);
      return output;
    };
  };

export default withLogging;
