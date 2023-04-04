import logger from "./logger";

const withLogging = (handler) => {
  return async (req, res) => {
    let now = new Date();
    let output = await handler(req, res);
    let elapsed = new Date() - now;

    logger.info(
      {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration: elapsed,
      },
      "Processed request"
    );
    return output;
  };
};

export default withLogging;
