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
}
