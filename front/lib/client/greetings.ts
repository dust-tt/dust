import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

const GREETINGS: ((name: string) => MessageDescriptor)[] = [
  (name) => msg`What’s next, ${name}?`,
  (name) => msg`What are we working on, ${name}?`,
  (name) => msg`What’s on your mind, ${name}?`,
  (name) => msg`What are we building, ${name}?`,
  (name) => msg`Where do we start, ${name}?`,
  (name) => msg`What’s the plan, ${name}?`,
  (name) => msg`What can I help with, ${name}?`,
  (name) => msg`What should we start with, ${name}?`,
  (name) => msg`What’s cooking, ${name}?`,
  (name) => msg`Ready when you are, ${name}.`,
];

export function getRandomGreetingForName(firstName: string): MessageDescriptor {
  const randomIndex = Math.floor(Math.random() * GREETINGS.length);
  return GREETINGS[randomIndex](firstName);
}
