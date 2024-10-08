export type Environment = "production" | "development";
export const ENV_DEV: Environment = "development";
export const ENV_PROD: Environment = "production";

export const isDevEnv = () => process.env.NODE_ENV === ENV_DEV;
export const isProdEnv = () => process.env.NODE_ENV === ENV_PROD;

const isValidEnv = (env?: string): env is Environment =>
  env === ENV_DEV || env === ENV_PROD;

export const getEnv = (): Environment =>
  isValidEnv(process.env.NODE_ENV) ? process.env.NODE_ENV : ENV_DEV;
