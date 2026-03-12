export const JOB_TYPES = [
  "customer_success",
  "customer_support",
  "data",
  "design",
  "engineering",
  "finance",
  "it",
  "people",
  "legal",
  "marketing",
  "operations",
  "procurement",
  "product",
  "revops",
  "sales",
  "other",
] as const;

export type JobType = (typeof JOB_TYPES)[number];

export function isJobType(value: unknown): value is JobType {
  return JOB_TYPES.includes(value as JobType);
}

export const JOB_TYPE_LABELS: Record<JobType, string> = {
  customer_success: "Customer Success",
  customer_support: "Customer Support",
  data: "Data",
  design: "Design",
  engineering: "Engineering",
  finance: "Finance",
  it: "IT",
  people: "People (HR)",
  legal: "Legal",
  marketing: "Marketing",
  operations: "Operations",
  procurement: "Procurement",
  product: "Product",
  revops: "RevOps",
  sales: "Sales",
  other: "Other",
};

export const JOB_TYPE_OPTIONS = JOB_TYPES.map((value) => ({
  value,
  label: JOB_TYPE_LABELS[value],
}));
