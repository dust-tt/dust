export type Environment = "production" | "development";
export const ENV_DEV: Environment = "development";
export const ENV_PROD: Environment = "production";

export const isDevEnv = (env: string) => env === ENV_DEV;
