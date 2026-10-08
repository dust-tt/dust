import type { HomepageUseCaseId } from "@app/types/api/homepage_use_cases";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export const HOMEPAGE_USE_CASE_MESSAGES: Record<
  HomepageUseCaseId,
  { label: MessageDescriptor; prompt: MessageDescriptor }
> = {
  "unanswered-messages": {
    label: msg`Find important emails I haven't replied to`,
    prompt: msg`Go through my inbox from the last 7 days and list the emails I have not replied to that need an answer from me. Group them by urgency, say who is waiting and since when, and suggest a one-line reply for each.`,
  },
  "unanswered-dms": {
    label: msg`Find important DMs I haven't replied to`,
    prompt: msg`Go through my direct messages from the last 7 days and list the ones I have not replied to that need an answer from me. Group them by urgency, say who is waiting and since when, and suggest a one-line reply for each.`,
  },
  "industry-news": {
    label: msg`Catch me up on the most important news in my industry`,
    prompt: msg`Catch me up on the most important news in our industry from the last 7 days. Use our own documents to work out what industry we are in and who our competitors are, then search the web. Give me the five stories that matter most to us, why each one matters, and sources.`,
  },
  "ai-news": {
    label: msg`Catch me up on the AI news that matters most`,
    prompt: msg`Catch me up on the AI news from the last 7 days that matters most: model releases, product launches, funding and regulation. Keep the five stories with real impact, say in one line why each one matters for a company like ours, and link the sources.`,
  },
  "dust-news": {
    label: msg`Show me what's new in Dust`,
    prompt: msg`Read the Dust changelog at https://docs.dust.tt/docs/changelog and tell me what shipped over the last month. Keep the five changes most useful to me, say in one line what each one lets me do, and link each entry.`,
  },
  "build-agent": {
    label: msg`Build an agent for a task I keep repeating`,
    prompt: msg`Help me build an agent for a task I keep repeating. Ask me what the task is, what it needs to read and what it should produce, then create the agent with me and show me how to use it.`,
  },
  "weekly-priorities": {
    label: msg`Help me identify and prioritize my key priorities for the week`,
    prompt: msg`Help me identify and prioritize my key priorities for this week. Look at what is on my plate from my calendar, messages and our documents where you can reach them, then rank the top five by impact and urgency, and flag what I can drop or delegate.`,
  },
  "workspace-usage": {
    label: msg`Show me how my team is using Dust`,
    prompt: msg`Show me how my team is using Dust this month: active members, the agents and skills they lean on, and how that compares with last month. Point out who has not started yet.`,
  },
  "create-pod": {
    label: msg`Create a Pod for my team project`,
    prompt: msg`Help me create a Pod for my team project. Ask me what the project is and who is working on it, then create the Pod with a clear description and add the right people.`,
  },
  "meeting-prep": {
    label: msg`Get me ready for my next customer meeting`,
    prompt: msg`Get me ready for my next customer meeting: who is attending, what we discussed last time, open action items on my side, and two or three points I should raise. Keep it to one page.`,
  },
  "account-research": {
    label: msg`Research an account before I reach out`,
    prompt: msg`Research the company I name before I reach out: what they do, recent news, who the likely buyers are, and what we already know about them in our own documents. Finish with three angles for a first message.`,
  },
  "deep-research": {
    label: msg`Research how our competitors position themselves`,
    prompt: msg`Research how our competitors have positioned themselves over the last year: the players that gained ground, what they shipped, how they talk about it, and where we are exposed. Use our own documents and the web, and write it up with sources.`,
  },
  "spreadsheet-analysis": {
    label: msg`Turn a spreadsheet into an analysis`,
    prompt: msg`Take the spreadsheet I attach, clean it up, and tell me what it says: the three numbers that matter, how they moved, and what looks off. Give me back a sheet with the analysis alongside the data.`,
  },
  "write-doc": {
    label: msg`Draft a document from our own knowledge`,
    prompt: msg`Draft a one-page brief on the topic I name, sourced from our own documents: where it stands, what is blocked, who owns what, and the decisions still open. Hand it back as a document.`,
  },
};
