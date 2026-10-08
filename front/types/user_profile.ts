import type { JobType } from "@app/types/job_type";

export const USER_PRONOUNS_METADATA_KEY = "pronouns";

export const MAX_USER_PRONOUNS_LENGTH = 32;

export type UserProfileType = {
  pronouns: string | null;
  jobType: JobType | null;
};
