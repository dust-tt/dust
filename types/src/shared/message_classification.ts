export const MESSAGE_CLASSES = [
  "business",
  "marketing",
  "sales",
  "engineering",
  "data analysis",
  "customer support",
  "product",
  "legal",
  "finance",
  "hr",
  "hiring",
  "ops",
  "security compliance",
  "summarization",
  "translation",
  "joking",
  "how-dust-works",
  "writing-compagnion",
  "search",
  "unknown",
] as const;

export type MESSAGE_CLASS = (typeof MESSAGE_CLASSES)[number];

export function isMessageClassification(value: string): value is MESSAGE_CLASS {
  return MESSAGE_CLASSES.includes(value as MESSAGE_CLASS);
}
