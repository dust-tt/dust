import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
const runtime = "/opt/gcs-dfs/cas-volume";
const base = "http://127.0.0.1:8085/v1";
const topic = "projects/dfs-sim/topics/cas-volume";
const progress = () =>
  Array.from({ length: 4 }, (_, i) =>
    JSON.parse(readFileSync(`${runtime}/progress-${i}.json`))
  ).reduce(
    (p, n) => ({
      acknowledged: p.acknowledged + n.acknowledged,
      applied: p.applied + n.applied,
    }),
    { acknowledged: 0, applied: 0 }
  );
const messages = Array.from({ length: 100 }, (_, index) => {
  const value = {
    bucket: "simulated-gcs",
    name: `w/tenant-${index % 64}/doc-${index}`,
    generation: "100",
    metageneration: "2",
    size: "0",
    updated: "2026-10-08T00:00:00.000Z",
  };
  return {
    data: Buffer.from(JSON.stringify(value)).toString("base64"),
    attributes: {
      eventType: "OBJECT_DELETE",
      payloadFormat: "JSON_API_V1",
      bucketId: value.bucket,
      objectId: value.name,
      objectGeneration: value.generation,
      eventTime: value.updated,
      notificationConfig: "simulation",
    },
  };
});
const result = JSON.parse(readFileSync(`${runtime}/result.json`));
const before = progress();
if (
  !result.completed ||
  before.applied !== result.sourceOperations ||
  before.acknowledged !== result.published
)
  throw new Error("Volume run must finish and drain before this probe");
execFileSync("systemctl", [
  "kill",
  "--kill-whom=main",
  "--signal=SIGSTOP",
  "gcs-dfs-cas-volume-server",
]);
let suspended;
const startedMs = Date.now();
try {
  const response = await fetch(`${base}/${topic}:publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`publish ${response.status}`);
  await delay(25000);
  suspended = progress();
  if (suspended.acknowledged !== before.acknowledged)
    throw new Error("Acknowledged messages during DFS suspension");
} finally {
  execFileSync("systemctl", [
    "kill",
    "--kill-whom=main",
    "--signal=SIGCONT",
    "gcs-dfs-cas-volume-server",
  ]);
}
const deadline = Date.now() + 120000;
while (
  progress().acknowledged < before.acknowledged + messages.length &&
  Date.now() < deadline
)
  await delay(1000);
const after = progress();
if (
  after.acknowledged < before.acknowledged + messages.length ||
  after.applied !== before.applied
)
  throw new Error("Replay did not converge as no-ops");
writeFileSync(
  `${runtime}/outage-replay.json`,
  JSON.stringify({
    verified: true,
    published: messages.length,
    suspensionMs: 25000,
    before,
    suspended,
    after,
    durationMs: Date.now() - startedMs,
  })
);
console.log(readFileSync(`${runtime}/outage-replay.json`, "utf8"));
