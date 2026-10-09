import json
import pathlib
import subprocess
import sys

manifest_path = pathlib.Path(__file__).with_name("resources.json")
manifest = json.loads(manifest_path.read_text())
if manifest["project"] != "dust-dev" or manifest["vm"] != "gcs-dfs-jd-20261008":
    raise SystemExit("Unexpected cleanup target")

common = ["--project=dust-dev", "--quiet"]
resources = []
for kind, fields in [("subscriptions", ["subscription", "deadLetterSubscription"]), ("topics", ["topic", "deadLetterTopic"])]:
    for field in fields:
        resources.append((field, ["pubsub", kind, "describe", manifest[field]], ["pubsub", kind, "delete", manifest[field]]))
resources.extend([
    ("bucket", ["storage", "buckets", "describe", "gs://" + manifest["bucket"]], ["storage", "rm", "--recursive", "--all-versions", "gs://" + manifest["bucket"]]),
    ("vm", ["compute", "instances", "describe", manifest["vm"], "--zone=" + manifest["zone"]], ["compute", "instances", "delete", manifest["vm"], "--zone=" + manifest["zone"], "--delete-disks=all"]),
    ("serviceAccount", ["iam", "service-accounts", "describe", manifest["serviceAccount"]], ["iam", "service-accounts", "delete", manifest["serviceAccount"]]),
])


def execute(command):
    result = subprocess.run(["gcloud", *command, *common], text=True, capture_output=True)
    return {"command": command, "exitCode": result.returncode, "output": result.stdout + result.stderr}


def absent(result):
    message = result["output"].lower()
    return result["exitCode"] != 0 and any(value in message for value in ["not_found", "not found", "does not exist"])


results = []
for field, describe, delete in resources:
    before = execute(describe)
    entry = {"resource": field, "before": before}
    if before["exitCode"] == 0:
        entry["delete"] = execute(delete)
        entry["after"] = execute(describe)
        entry["absent"] = absent(entry["after"])
    else:
        entry["absent"] = absent(before)
    if field == "serviceAccount" and not entry["absent"]:
        inventory = execute(["iam", "service-accounts", "list", "--filter=email=" + manifest["serviceAccount"], "--format=json(email,uniqueId)"])
        entry["inventory"] = inventory
        entry["absent"] = inventory["exitCode"] == 0 and json.loads(inventory["output"]) == []
    results.append(entry)
    manifest_path.with_name("cleanup-results.json").write_text(json.dumps(results, indent=2) + "\n")
    print(json.dumps({"resource": field, "absent": entry["absent"]}))

disk = execute(["compute", "disks", "describe", manifest["vm"], "--zone=" + manifest["zone"]])
results.append({"resource": "bootDisk", "after": disk, "absent": absent(disk)})
manifest_path.with_name("cleanup-results.json").write_text(json.dumps(results, indent=2) + "\n")
if not all(result["absent"] for result in results):
    raise SystemExit("Some resources remain or could not be verified; inspect cleanup-results.json")
manifest["status"] = "all experiment cloud resources deleted and absence verified"
manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
