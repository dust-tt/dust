export const MESSAGE_CLASSES = [
  "business",
  "marketing",
  "sales",
  "engineering",
  "coding",
  "data",
  "customer support",
  "product",
  "product marketing",
  "legal",
  "finance",
  "hr",
  "hiring",
  "ops",
  "security compliance",
  "unknown",
] as const;

export type MESSAGE_CLASS = (typeof MESSAGE_CLASSES)[number];

export function isMessageClassification(value: string): value is MESSAGE_CLASS {
  return MESSAGE_CLASSES.includes(value as MESSAGE_CLASS);
}
