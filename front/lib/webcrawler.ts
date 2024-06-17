export function urlToDataSourceName(url: string) {
  function sanitizeString(inputString: string): string {
    // Regular expression to match characters that are NOT letters, numbers, '.', '_', or '-'
    // ^ outside of character set negates the set, matching anything not in the set
    const regex = /[^a-zA-Z0-9._-]/g;

    // Replace characters that match the regex with '-'
    const sanitizedString = inputString.replace(regex, "_");

    return sanitizedString;
  }

  let name = "";
  try {
    const parsed = new URL(url);
    if (parsed.pathname === "/") {
      // no path after the hostname
      name += parsed.hostname;
    } else {
      // We have a path after the hostname
      name +=
        parsed.hostname +
        decodeURIComponent(parsed.pathname).replaceAll("/", "-");
    }
    name = name.substring(0, 60);
    return sanitizeString(name);
  } catch (e) {
    // We failed to parse the URL, we are going to return an empty string
    return "";
  }
}

const urlValidationRegex = new RegExp(
  "^(https?:\\/\\/)?" + // validate protocol
    "((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|" + // validate domain name
    "((\\d{1,3}\\.){3}\\d{1,3}))" + // validate OR ip (v4) address
    "(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*" + // validate port and path
    "(\\?[;&a-z\\d%_.~+=-]*)?" + // validate query string
    "(\\#[-a-z\\d_]*)?$",
  "i"
); // validate fragment locator

export function isUrlValid(url: string) {
  try {
    if (url.trim().length === 0) {
      return false;
    }
    return urlValidationRegex.test(url);
  } catch (e) {
    return false;
  }
}
