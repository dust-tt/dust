// What an agent is doing while it works. A conversation at work has nothing to
// report yet — the description still says what was last said — so the row says
// the step the agent is on instead, and moves through the steps for as long as
// the work lasts.

/**
 * The steps an agent moves through. They are in no order: a row can be on any
 * of them at any time, and the list only has to read as work being done.
 */
export const AGENT_ACTIONS = [
  "Thinking",
  "Searching the web",
  "Reading your Gmail",
  "Querying Notion",
  "Digging through Slack",
  "Opening a spreadsheet",
  "Running a search in Drive",
  "Reading the Jira ticket",
  "Crunching the numbers",
  "Writing the summary",
];

/**
 * The beat every working row is read off. It is shorter than a step so rows can
 * fall on different beats; how many beats a step lasts is the row's own.
 */
export const AGENT_ACTION_TICK_MS = 600;

/** A step lasts a few beats — between two and three and a half seconds. */
const MIN_STEP_TICKS = 3;
const STEP_TICKS_SPREAD = 4;

/** A stable number for an id, so a row's rhythm is the same one every render. */
function hashId(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index++) {
    hash = (hash * 31 + id.charCodeAt(index)) % 100003;
  }
  return hash;
}

/**
 * @cc [owner:Duncid,label:product] agent-action-stable-per-row
 * The step a row shows MUST follow from its id and the tick alone. A row on an
 * unchanged tick MUST read the same on every render, and two rows on the same
 * tick MUST be free to differ — so the list reads as several agents each doing
 * their own thing rather than one thing repeated down the page.
 */
export function getAgentAction(rowId: string, tick: number): string {
  const seed = hashId(rowId);
  const stepTicks = MIN_STEP_TICKS + (seed % STEP_TICKS_SPREAD);
  const step = Math.floor((tick + seed) / stepTicks) + seed;

  return AGENT_ACTIONS[step % AGENT_ACTIONS.length];
}
