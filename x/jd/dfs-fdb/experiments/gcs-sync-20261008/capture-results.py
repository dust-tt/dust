import datetime
import json
import pathlib
import subprocess

runtime = pathlib.Path("/opt/gcs-dfs/cas-volume")
result = json.loads((runtime / "result.json").read_text())
if result.get("completed") is not True:
    raise SystemExit("Volume run is incomplete")
workers = [json.loads(path.read_text()) for path in sorted(runtime.glob("progress-*.json"))]
summary = {
    "capturedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "result": result,
    "phases": json.loads((runtime / "phases.json").read_text()),
    "expected": json.loads((runtime / "expected.json").read_text()),
    "workers": workers,
    "totals": {key: sum(worker[key] for worker in workers) for key in ["acknowledged", "applied", "stale", "stagedBytes", "maxRssBytes"]},
    "sourceOperationsPerSecond": result["sourceOperations"] * 1000 / result["durationMs"],
    "publishedMessagesPerSecond": result["published"] * 1000 / result["durationMs"],
}
units = [f"gcs-dfs-cas-volume-worker-{index}" for index in range(result["workers"])]
command = ["journalctl", "--no-pager", "-o", "cat"]
for unit in units:
    command.extend(["-u", unit])
lines = subprocess.check_output(command, text=True).splitlines()
summary["workerWarningsAndErrors"] = [json.loads(line) for line in lines if line.startswith("{")]
summary["fdbDiskUsage"] = subprocess.check_output(["du", "-sh", "/opt/gcs-dfs/fdb/data"], text=True).strip()
summary["executedBundleSha256"] = subprocess.check_output(["sha256sum", "/opt/gcs-dfs/app/simulate.js"], text=True).split()[0]
summary["processSnapshot"] = subprocess.check_output(["ps", "-eo", "comm,pcpu,rss", "--sort=-rss"], text=True).splitlines()[:9]
print(json.dumps(summary, indent=2))
