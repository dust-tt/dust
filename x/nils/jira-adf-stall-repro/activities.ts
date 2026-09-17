import { searchJiraIssuesUsingJql } from "@app/lib/api/actions/servers/jira/jira_api_helper";
import { Context } from "@temporalio/activity";

const ts = () => new Date().toISOString();

// Calls the REAL searchJiraIssuesUsingJql -> jiraApiCall -> JSON.parse ->
// JiraSearchResultSchema.safeParse. Nothing on that path is mocked; only the
// HTTP endpoint is redirected to the local fixture server.
export async function jiraSearchStallActivity(): Promise<string> {
  console.log(`[stall] ${ts()} activity start`);
  Context.current().heartbeat("start");

  const t0 = Date.now();
  const res = await searchJiraIssuesUsingJql(
    "http://127.0.0.1:7799",
    { id: "cloud-id", url: "https://example.atlassian.net", name: "repro" },
    "fake-token-not-used-by-fixture",
    "key = STALL-1",
    { maxResults: 20, fields: ["summary", "description"] }
  );
  const elapsed = Date.now() - t0;

  console.log(`[stall] ${ts()} searchJiraIssuesUsingJql returned after ${elapsed}ms, isOk=${res.isOk()}`);
  // Heartbeating only AFTER the blocking parse is the whole point: the activity
  // had no opportunity to heartbeat while the event loop was occupied.
  try {
    Context.current().heartbeat("done");
    console.log(`[stall] ${ts()} post-parse heartbeat accepted`);
  } catch (e) {
    console.log(`[stall] ${ts()} post-parse heartbeat threw: ${String(e)}`);
  }
  return `elapsed=${elapsed}ms isOk=${res.isOk()}`;
}

// Harmless neighbour on the SAME worker process. Its heartbeat cadence is the
// evidence for cross-activity (and so cross-conversation) impact.
export async function canaryHeartbeatActivity(seconds: number): Promise<string> {
  const beats: number[] = [];
  const start = Date.now();
  while (Date.now() - start < seconds * 1000) {
    Context.current().heartbeat(`beat-${beats.length}`);
    const at = Date.now() - start;
    beats.push(at);
    console.log(`[canary] ${ts()} beat #${beats.length} at +${at}ms`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  // Report the largest gap between consecutive beats.
  let maxGap = 0;
  for (let i = 1; i < beats.length; i++) maxGap = Math.max(maxGap, beats[i] - beats[i - 1]);
  console.log(`[canary] ${ts()} finished, beats=${beats.length} maxGapMs=${maxGap}`);
  return `beats=${beats.length} maxGapMs=${maxGap}`;
}
