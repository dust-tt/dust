import type { APIErrorWithContentfulStatusCode } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";

type GroupMemberChangeErrorCode =
  | "group_requirements_not_met"
  | "last_group_member"
  | "system_or_global_group"
  | "user_already_member"
  | "user_not_member";

// API error of a rejected group membership change (`GroupResource` member updates and
// `GroupMembershipError`).
export function groupMemberChangeApiError(
  code: GroupMemberChangeErrorCode,
  message: string
): APIErrorWithContentfulStatusCode {
  switch (code) {
    case "group_requirements_not_met":
      return {
        status_code: 400,
        api_error: { type: "group_requirements_not_met", message },
      };
    case "last_group_member":
      return {
        status_code: 400,
        api_error: { type: "last_group_member_cannot_be_removed", message },
      };
    case "system_or_global_group":
      return {
        status_code: 400,
        api_error: { type: "group_not_editable", message },
      };
    case "user_already_member":
      return {
        status_code: 409,
        api_error: { type: "user_already_group_member", message },
      };
    case "user_not_member":
      return {
        status_code: 400,
        api_error: { type: "user_not_group_member", message },
      };
    default:
      return assertNever(code);
  }
}
