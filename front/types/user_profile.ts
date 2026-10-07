export const USER_PRONOUNS_METADATA_KEY = "pronouns";
export const USER_JOB_TITLE_METADATA_KEY = "job_title";

export const MAX_USER_PRONOUNS_LENGTH = 32;
export const MAX_USER_JOB_TITLE_LENGTH = 128;

export type UserProfileType = {
  pronouns: string | null;
  jobTitle: string | null;
};
