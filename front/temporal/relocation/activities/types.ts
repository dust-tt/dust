export interface RelocationBlob<T extends string = string> {
  statements: Record<T, string[]>;
}

export type CoreEntitiesRelocationBlob = RelocationBlob<
  "plans" | "users" | "workspace"
>;
