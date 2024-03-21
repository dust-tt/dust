export function urlToDataSourceName(url: string) {
  return url
    .trim()
    .replace(/https?:\/\//, "")
    .replace(/\/$/, "")
    .replace(/\//g, "-")
    .replace(/\?/g, "-");
}
