const { URL, XP1_CHROME_WEB_STORE_URL } = process.env;

export default async function handler(req, res) {
  // If available get version as get parameter.
  const { version } = req.query;
  if (version) {
    console.log("VERSION CHECK", version);
  } else {
    console.log("VERSION CHECK", "0.1.0 (inferred)");
  }

  res.status(200).json({
    accepted_versions: ["0.2.2", "0.3.0"],
    update_url: `${URL}/xp1/install`,
    download_url: XP1_CHROME_WEB_STORE_URL,
  });
}
