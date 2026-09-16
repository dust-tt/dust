import type { FileViewerType } from "@app/types/file_viewers";
import type { SharingGrantType } from "@app/types/files";
import { MAX_EMAILS_OR_DOMAINS_PER_INVITE } from "@app/types/files";
import type { UserType } from "@app/types/user";
import { z } from "zod";

// Exact DNS name. A leading @ is accepted, but omitted from stored domains.
export const sharingDomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) => value.replace(/^@/, ""))
  .pipe(
    z
      .string()
      .max(253)
      .regex(
        /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
        "Enter a domain such as example.com"
      )
  );

export const sharingEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(255);

export const addSharingGrantsSchema = z
  .object({
    emails: z
      .array(z.string().email())
      .max(MAX_EMAILS_OR_DOMAINS_PER_INVITE)
      .optional(),
    domains: z
      .array(sharingDomainSchema)
      .max(MAX_EMAILS_OR_DOMAINS_PER_INVITE)
      .optional(),
  })
  .refine(
    ({ emails = [], domains = [] }) =>
      emails.length + domains.length > 0 &&
      emails.length + domains.length <= MAX_EMAILS_OR_DOMAINS_PER_INVITE,
    {
      message: `Add between 1 and ${MAX_EMAILS_OR_DOMAINS_PER_INVITE} email addresses or domains`,
    }
  );

export type SharingGrantTarget =
  | { kind: "email"; value: string }
  | { kind: "domain"; value: string };

export interface FileSharingGrantType {
  sId: string;
  target: SharingGrantTarget;
  grantedAt: number;
  grantedBy: UserType | null;
  expiresAt: number | null;
  revokedAt: number | null;
  blockedByPolicy?: boolean;
}

export interface SharingGrantsResponse {
  grants: SharingGrantType[];
  accessGrants?: FileSharingGrantType[];
  viewers?: FileViewerType[];
  canGrantDomains?: boolean;
}
