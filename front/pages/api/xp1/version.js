const { URL, XP1_CHROME_WEB_STORE_URL } = process.env;
import withLogging from "@app/logger/withlogging";
import logger from "@app/logger/logger";

async function handler(req, res) {
  // If available get version as get parameter.
  const { version } = req.query;
  if (version) {
    loggger.info({ version }, "XP1 version check");
  } else {
    loggger.info({ version: "0.1.0 (inferred)" }, "XP1 version check");
  }

  res.status(200).json({
    accepted_versions: ["0.3.0"],
    update_url: `${URL}/xp1/install`,
    download_url: XP1_CHROME_WEB_STORE_URL,
  });
}

export default withLogging(handler);
