// Stands in for Jira. Separate process from the worker, so we can show the HTTP
// response is fast even while the worker is wedged.
import http from "http";
import { buildSearchResponse } from "./fixture";

const body = JSON.stringify(buildSearchResponse());
const server = http.createServer((req, res) => {
  console.log(`[fixture] ${new Date().toISOString()} ${req.method} ${req.url} -> 200 (${body.length} bytes)`);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(body);
});
server.listen(7799, "127.0.0.1", () => console.log("[fixture] listening on http://127.0.0.1:7799"));
