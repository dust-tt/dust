const GREETINGS = [
  "What's next, [Name]?",
  "What are we working on, [Name]?",
  "What's on your mind, [Name]?",
  "What are we building, [Name]?",
  "Where do we start, [Name]?",
  "What's the plan, [Name]?",
  "What can I help with, [Name]?",
  "What should we start with, [Name]?",
  "What's cooking, [Name]?",
  "Ready when you are, [Name].",
];

// The Inbox greets you over a list it has already gathered, so it does the
// telling. Asking "what did I miss?" would hand that job back to the reader;
// the questions that stay are the ones nobody answers literally.
const INBOX_GREETINGS = [
  "What's new, [Name]?",
  "What's cooking, [Name]?",
  "Let's catch up, [Name].",
  "Ready to catch up, [Name]?",
  "Here's what you missed, [Name].",
  "Here's the latest, [Name].",
  "Let me catch you up, [Name].",
  "A few things moved, [Name].",
  "You've got news, [Name].",
  "Welcome back, [Name].",
];

function pickGreeting(greetings: string[], firstName: string) {
  const randomIndex = Math.floor(Math.random() * greetings.length);
  return greetings[randomIndex].replace("[Name]", firstName);
}

export function getRandomGreetingForName(firstName: string) {
  return pickGreeting(GREETINGS, firstName);
}

export function getRandomInboxGreetingForName(firstName: string) {
  return pickGreeting(INBOX_GREETINGS, firstName);
}
