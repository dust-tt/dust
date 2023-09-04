export const nullable = <T>(input: T): T => {
  return {
    ...input,
    nullable: true,
  } as T;
};
