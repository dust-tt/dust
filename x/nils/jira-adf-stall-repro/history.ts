import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";

async function main() {
  const client = await getTemporalClientForFrontNamespace();
  for (const wfId of process.argv.slice(2)) {
    console.log(`\n=== ${wfId} ===`);
    const handle = client.workflow.getHandle(wfId);
    const hist = await handle.fetchHistory();
    const events = hist.events ?? [];
    console.log(`total events: ${events.length}`);
    for (const ev of events) {
      const type = String(ev.eventType);
      const t = ev.eventTime?.seconds
        ? new Date(Number(ev.eventTime.seconds) * 1000).toISOString()
        : "";
      const attrs: any =
        (ev as any).activityTaskTimedOutEventAttributes ??
        (ev as any).activityTaskFailedEventAttributes ??
        (ev as any).workflowExecutionFailedEventAttributes;
      const failure = attrs?.failure;
      const timeoutType = failure?.timeoutFailureInfo?.timeoutType;
      console.log(
        `#${ev.eventId} ${t} type=${type}` +
          (timeoutType !== undefined ? `  timeoutType=${timeoutType}` : "") +
          (failure?.message ? `  msg="${failure.message}"` : "")
      );
    }
  }
  process.exit(0);
}
void main();
