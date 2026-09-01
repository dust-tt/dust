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

const INBOX_GREETINGS = [
  "What's new, [Name]?",
  "What's cooking, [Name]?",
  "Let's catch up, [Name].",
  "What did I miss, [Name]?",
  "What's the latest, [Name]?",
  "Anything I should know, [Name]?",
  "Catch me up, [Name].",
  "What's happening, [Name]?",
  "Ready to catch up, [Name]?",
  "What's come up, [Name]?",
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
