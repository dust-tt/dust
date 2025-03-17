export const validateUrl = (
  urlString: string
):
  | {
      valid: false;
      standardized: null;
    }
  | {
      valid: true;
      standardized: string;
    } => {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch (e) {
    return { valid: false, standardized: null };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { valid: false, standardized: null };
  }

  if (url.pathname.includes("//")) {
    return { valid: false, standardized: null };
  }

  return { valid: true, standardized: url.href };
};
