import turndown from "turndown";

import logger from "@app/logger/logger";
type contentFragmentFromUrl = {
  title: string;
  content: string;
  url: string;
};

export async function extractContentFragmentFromURL(
  content: string
): Promise<contentFragmentFromUrl | null> {
  const gotScraping = (await import("got-scraping")).gotScraping;

  try {
    const urlRegexp =
      /(http|ftp|https):\/\/([\w_-]+(?:(?:\.[\w_-]+)+))([\w.,@?^=%&:\/~+#-]*[\w@?^=%&\/~+#-])/;

    const matches = content.match(urlRegexp);
    if (!matches) {
      return null;
    }

    const url = matches[0];
    const response = gotScraping.get(url);

    const body = await response.text();
    console.log("body is", body);
    let title = "Web page";
    const titleRegexp = /<title.*?>(.*?)<\/title>/;
    const titleMatches = body.match(titleRegexp);
    if (!titleMatches) {
      logger.info({ url }, "Could not find title in URL");
    } else if (titleMatches.length > 1) {
      title = titleMatches[1];
    }

    const markdown = new turndown()
      .remove(["style", "script", "iframe"])
      .turndown(body);

    return {
      title: title.substring(0, 300),
      content: markdown,
      url: url,
    };
  } catch (e) {
    if (e instanceof Error) {
      logger.error(
        { error: e.message },
        "Error while extracting content fragment from URL"
      );
    } else {
      logger.error(
        { error: e },
        "Error while extracting content fragment from URL"
      );
    }
    return null;
  }
}
