// see here: https://github.com/ajv-validator/ajv/issues/1375#issuecomment-1328076097
// AJV is a little broken in the way it handles nullable types.

export const nullable = <T>(input: T): T => {
  return {
    ...input,
    nullable: true,
  } as T;
};
