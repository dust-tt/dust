import type { EgressPolicyDomainError } from "@app/types/sandbox/egress_policy";
import { EGRESS_POLICY_DOMAIN_MAX_LENGTH } from "@app/types/sandbox/egress_policy";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export function getEgressPolicyDomainErrorMessage(
  error: EgressPolicyDomainError
): MessageDescriptor {
  const { code, domain } = error;
  const maxLength = EGRESS_POLICY_DOMAIN_MAX_LENGTH;

  switch (code) {
    case "empty":
      return domain === undefined
        ? msg`Domain cannot be empty.`
        : msg`${domain}: Domain cannot be empty.`;
    case "too_long":
      return domain === undefined
        ? msg`Domain must be ${maxLength} characters or less.`
        : msg`${domain}: Domain must be ${maxLength} characters or less.`;
    case "ip_address":
      return domain === undefined
        ? msg`IP addresses are not supported.`
        : msg`${domain}: IP addresses are not supported.`;
    case "invalid_format":
      return domain === undefined
        ? msg`Use an exact domain such as api.github.com or a wildcard such as *.github.com.`
        : msg`${domain}: Use an exact domain such as api.github.com or a wildcard such as *.github.com.`;
    case "tld_without_letter":
      return domain === undefined
        ? msg`Domain must have a top-level label containing a letter.`
        : msg`${domain}: Domain must have a top-level label containing a letter.`;
    case "wildcard_without_suffix":
      return domain === undefined
        ? msg`Wildcard domains must include a suffix.`
        : msg`${domain}: Wildcard domains must include a suffix.`;
    case "invalid_wildcard":
      return domain === undefined
        ? msg`Wildcards must use the form *.example.com.`
        : msg`${domain}: Wildcards must use the form *.example.com.`;
    case "https_secret_single_label":
      return domain === undefined
        ? msg`HTTPS secret domains need at least two DNS labels separated by a dot, such as github.com or api.github.com.`
        : msg`${domain}: HTTPS secret domains need at least two DNS labels separated by a dot, such as github.com or api.github.com.`;
    default:
      assertNever(code);
  }
}
