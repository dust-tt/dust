const GREETINGS = [
  "What’s next, [Name]?",
  "What are we working on, [Name]?",
  "What’s on your mind, [Name]?",
  "What are we building, [Name]?",
  "Where do we start, [Name]?",
  "What‘s the plan, [Name]?",
  "What can I help with, [Name]?",
  "What should we start with, [Name]?",
  "What’s cooking, [Name]?",
  "Ready when you are, [Name].",
];

export function getRandomGreetingForName(firstName: string) {
  const randomIndex = Math.floor(Math.random() * GREETINGS.length);
  return GREETINGS[randomIndex].replace("[Name]", firstName);
}
