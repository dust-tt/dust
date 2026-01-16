interface ImportMeta {
  glob: <T = unknown>(
    pattern: string,
    options?: {
      eager?: boolean;
      import?: string;
    }
  ) => Record<string, T>;
}
