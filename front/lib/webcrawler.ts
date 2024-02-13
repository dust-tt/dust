export function urlToDataSourceName(url: string) {
  return url
    .replace(/https?:\/\//, "")
    .replace(/\/$/, "")
    .replace(/\//g, "-");
}
