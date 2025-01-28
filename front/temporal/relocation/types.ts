export interface RelocationBlob<T extends string = string> {
  statements: Record<T, string[]>;
}
