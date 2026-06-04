use base64::{engine::general_purpose, Engine as _};
use tracing::debug;

use crate::egress_secrets::{
    Secret, SecretTable, PLACEHOLDER_HEX_LEN, PLACEHOLDER_PREFIX as PLACEHOLDER_PREFIX_STR,
    PLACEHOLDER_SUFFIX as PLACEHOLDER_SUFFIX_STR,
};

use super::deny_log::{DenyLogEntry, DenyReason};

const PLACEHOLDER_PREFIX: &[u8] = PLACEHOLDER_PREFIX_STR.as_bytes();
const PLACEHOLDER_SUFFIX: &[u8] = PLACEHOLDER_SUFFIX_STR.as_bytes();
const PLACEHOLDER_LEN: usize =
    PLACEHOLDER_PREFIX_STR.len() + PLACEHOLDER_HEX_LEN + PLACEHOLDER_SUFFIX_STR.len();

#[derive(Clone, Copy, Debug)]
pub(super) enum RewriteMode<'a> {
    Tls { sni: &'a str },
    PlainHttp { domain: &'a str },
}

impl RewriteMode<'_> {
    pub(super) fn port(self) -> u16 {
        match self {
            Self::Tls { .. } => 443,
            Self::PlainHttp { .. } => 80,
        }
    }

    fn domain(&self) -> Option<&str> {
        match self {
            Self::Tls { sni } => Some(sni),
            Self::PlainHttp { domain } => Some(domain),
        }
    }

    fn sni(&self) -> Option<&str> {
        match self {
            Self::Tls { sni } => Some(sni),
            Self::PlainHttp { .. } => None,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct HeaderPart {
    pub name: String,
    pub value: Vec<u8>,
}

#[derive(Clone, Debug)]
pub(super) struct RequestParts {
    pub method: String,
    pub target: String,
    pub headers: Vec<HeaderPart>,
}

pub(super) enum Authority<'a> {
    HostHeader,
    Explicit { value: &'a str },
}

pub(super) struct ProcessedPolicyRequest {
    pub headers: Vec<HeaderPart>,
}

pub(super) fn process_request_policy(
    request: &RequestParts,
    authority: Authority<'_>,
    secret_table: &SecretTable,
    mode: RewriteMode<'_>,
) -> Result<ProcessedPolicyRequest, DenyLogEntry> {
    validate_request_line_policy(request, mode)?;
    let host = normalized_authority(request, authority, mode)?;
    let headers = rewrite_request_headers(request, &host, secret_table, mode)?;

    Ok(ProcessedPolicyRequest { headers })
}

pub(super) fn validate_request_line_policy(
    request: &RequestParts,
    mode: RewriteMode<'_>,
) -> Result<(), DenyLogEntry> {
    if request.method.eq_ignore_ascii_case("CONNECT") {
        return Err(deny_entry(
            mode,
            DenyReason::ConnectMethodForbidden,
            None,
            None,
        ));
    }

    let request_line = format!("{} {} HTTP/1.1", request.method, request.target);
    if contains_placeholder(request_line.as_bytes()) {
        return Err(match mode {
            RewriteMode::PlainHttp { .. } => deny_entry(
                mode,
                DenyReason::Port80Placeholder,
                None,
                normalized_host_for_log(request, mode).as_deref(),
            ),
            RewriteMode::Tls { .. } => deny_entry(
                mode,
                DenyReason::UrlLinePlaceholder,
                None,
                normalized_host_for_log(request, mode).as_deref(),
            ),
        });
    }

    Ok(())
}

pub(super) fn rewrite_request_headers(
    request: &RequestParts,
    host: &str,
    secret_table: &SecretTable,
    mode: RewriteMode<'_>,
) -> Result<Vec<HeaderPart>, DenyLogEntry> {
    request
        .headers
        .iter()
        .map(|header| {
            rewrite_header_value(header, host, secret_table, mode).map(|value| HeaderPart {
                name: header.name.clone(),
                value,
            })
        })
        .collect::<Result<Vec<_>, _>>()
}

pub(super) fn deny_entry(
    mode: RewriteMode<'_>,
    reason: DenyReason,
    secret_name: Option<&str>,
    host: Option<&str>,
) -> DenyLogEntry {
    DenyLogEntry::mitm(
        reason,
        mode.domain(),
        mode.port(),
        secret_name,
        mode.sni(),
        host,
    )
}

pub(super) fn contains_placeholder(bytes: &[u8]) -> bool {
    let mut cursor = 0;
    while cursor + PLACEHOLDER_LEN <= bytes.len() {
        if bytes[cursor..].starts_with(PLACEHOLDER_PREFIX)
            && is_valid_placeholder_bytes(&bytes[cursor..cursor + PLACEHOLDER_LEN])
        {
            return true;
        }
        cursor += 1;
    }
    false
}

pub(super) fn normalize_host(value: &str, default_port: u16) -> Result<String, ()> {
    let value = value.trim().to_ascii_lowercase();
    let value = value.strip_suffix('.').unwrap_or(&value).to_string();
    if value.is_empty() {
        return Err(());
    }

    if let Some(rest) = value.strip_prefix('[') {
        let Some((inside, after_bracket)) = rest.split_once(']') else {
            return Err(());
        };
        if after_bracket.is_empty() {
            return Ok(inside.to_string());
        }
        let Some(port) = after_bracket.strip_prefix(':') else {
            return Err(());
        };
        return if port.parse::<u16>().ok() == Some(default_port) {
            Ok(inside.to_string())
        } else {
            Ok(format!("[{inside}]:{port}"))
        };
    }

    match value.rsplit_once(':') {
        Some((host, port)) if !host.contains(':') => {
            if host.is_empty() || port.is_empty() {
                return Err(());
            }
            let host = host.strip_suffix('.').unwrap_or(host);
            if port.parse::<u16>().ok() == Some(default_port) {
                Ok(host.to_string())
            } else if port.chars().all(|c| c.is_ascii_digit()) {
                Ok(format!("{host}:{port}"))
            } else {
                Err(())
            }
        }
        _ => Ok(value),
    }
}

fn normalized_host_for_log(request: &RequestParts, mode: RewriteMode<'_>) -> Option<String> {
    request
        .headers
        .iter()
        .find(|header| header.name.eq_ignore_ascii_case("host"))
        .and_then(|header| {
            std::str::from_utf8(&header.value)
                .ok()
                .and_then(|value| normalize_host(value, mode.port()).ok())
        })
}

fn rewrite_header_value(
    header: &HeaderPart,
    host: &str,
    secret_table: &SecretTable,
    mode: RewriteMode<'_>,
) -> Result<Vec<u8>, DenyLogEntry> {
    if matches!(mode, RewriteMode::PlainHttp { .. }) && contains_placeholder(&header.value) {
        return Err(deny_entry(
            mode,
            DenyReason::Port80Placeholder,
            None,
            Some(host),
        ));
    }

    // Never release a real secret into a non-credential header that tends to
    // be reflected back in responses (CORS `Origin`, request-id/trace echo,
    // `/cdn-cgi/trace`'s `uag=`) or written to logs and forwarded downstream.
    // Substituting here would let the agent read the secret back or leak it,
    // defeating the placeholder model. Leave the opaque placeholder in place
    // (it reveals nothing) rather than substituting or dropping the
    // connection. Checked after the port-80 guard so plaintext HTTP keeps its
    // stricter drop-on-placeholder behavior.
    //
    // Note this short-circuits before the substitution path, so it also
    // suppresses that path's unknown-placeholder and non-allowed-host denies
    // for these headers: a forged or cross-host placeholder in a blocklisted
    // header now travels upstream as the opaque placeholder instead of
    // dropping the connection. Acceptable because the placeholder reveals
    // nothing and any real credential check fails loudly upstream.
    if is_unsafe_substitution_header(&header.name) {
        if contains_placeholder(&header.value) {
            debug!(
                header = %header.name,
                host = %host,
                "skipping secret substitution in unsafe header; placeholder left in place"
            );
        }
        return Ok(header.value.clone());
    }

    if header.name.eq_ignore_ascii_case("authorization") {
        if let Some(value) = rewrite_basic_auth(&header.value, host, secret_table, mode)? {
            return Ok(value);
        }
    }

    match substitute_placeholders(&header.value, host, secret_table, mode)? {
        Some(rewritten) => Ok(rewritten),
        None => Ok(header.value.clone()),
    }
}

// Request headers we never substitute secrets into. These are not credential
// carriers and are routinely reflected back to the client (CORS `Origin`,
// request-id/trace echo, `/cdn-cgi/trace`'s `uag=`) or written to logs and
// forwarded downstream, so a real secret placed here would round-trip back to
// the agent or leak out of band.
//
// This is a blocklist by design, not a credential allowlist: standard auth
// headers (`Authorization`, `Cookie`, `Proxy-Authorization`) and any bespoke
// custom header (`X-Api-Key`, `X-Acme-Token`, ...) still substitute, so
// callers using non-standard auth header names are unaffected.
fn is_unsafe_substitution_header(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();

    // Prefix families: UA client hints (`Sec-CH-UA`, `Sec-CH-UA-Platform`,
    // ...), fetch metadata (`Sec-Fetch-Site`, ...), B3 trace headers
    // (`X-B3-TraceId`, `X-B3-SpanId`, ...), and Datadog trace headers
    // (`X-Datadog-Trace-Id`, `X-Datadog-Parent-Id`, ...).
    if lower.starts_with("sec-ch-ua")
        || lower.starts_with("sec-fetch-")
        || lower.starts_with("x-b3-")
        || lower.starts_with("x-datadog-")
    {
        return true;
    }

    matches!(
        lower.as_str(),
        // Identity / referrer — reflected by echo endpoints and analytics, logged.
        "user-agent"
            | "referer"
            | "origin"
            | "from"
            // Forwarding / proxy metadata — logged and echoed by debug endpoints.
            | "x-forwarded-for"
            | "x-forwarded-host"
            | "x-forwarded-proto"
            | "x-forwarded-port"
            | "forwarded"
            | "x-real-ip"
            | "via"
            // Request-id / trace context — echoed into response headers by convention.
            | "x-request-id"
            | "x-correlation-id"
            | "request-id"
            | "traceparent"
            | "tracestate"
            | "x-amzn-trace-id"
            | "x-cloud-trace-context"
            | "uber-trace-id"
            | "b3"
            // Privacy / preference signals — never credentials, UA-like reflection.
            | "dnt"
            | "sec-gpc"
            // Content negotiation (extended) — never credentials.
            | "accept"
            | "accept-encoding"
            | "accept-language"
            | "accept-charset"
            // Caching / conditional (extended) — never credentials.
            | "cache-control"
            | "pragma"
            | "if-match"
            | "if-none-match"
            | "if-modified-since"
            | "if-unmodified-since"
            | "if-range"
            | "range"
    )
}

fn rewrite_basic_auth(
    value: &[u8],
    host: &str,
    secret_table: &SecretTable,
    mode: RewriteMode<'_>,
) -> Result<Option<Vec<u8>>, DenyLogEntry> {
    let Ok(value_text) = std::str::from_utf8(value) else {
        return Ok(None);
    };
    let trimmed = value_text.trim();
    let Some(rest) = strip_basic_prefix(trimmed) else {
        return Ok(None);
    };

    // Malformed Basic payloads are still normal Authorization headers; leave
    // them on the generic placeholder substitution path below.
    let Ok(decoded) = general_purpose::STANDARD.decode(rest.trim()) else {
        return Ok(None);
    };

    if matches!(mode, RewriteMode::PlainHttp { .. }) && contains_placeholder(&decoded) {
        return Err(deny_entry(
            mode,
            DenyReason::Port80Placeholder,
            None,
            Some(host),
        ));
    }

    let Some(rewritten_decoded) = substitute_placeholders(&decoded, host, secret_table, mode)?
    else {
        return Ok(None);
    };
    let encoded = general_purpose::STANDARD.encode(rewritten_decoded);
    Ok(Some(format!("Basic {encoded}").into_bytes()))
}

fn strip_basic_prefix(value: &str) -> Option<&str> {
    let bytes = value.as_bytes();
    if bytes.len() <= "basic".len() {
        return None;
    }
    let (scheme, rest) = bytes.split_at("basic".len());
    if !scheme.eq_ignore_ascii_case(b"basic") {
        return None;
    }
    if !rest[0].is_ascii_whitespace() {
        return None;
    }
    std::str::from_utf8(rest).ok()
}

fn substitute_placeholders(
    input: &[u8],
    host: &str,
    secret_table: &SecretTable,
    mode: RewriteMode<'_>,
) -> Result<Option<Vec<u8>>, DenyLogEntry> {
    let mut output = Vec::with_capacity(input.len());
    let mut last_copied = 0;
    let mut cursor = 0;
    let mut changed = false;

    while cursor + PLACEHOLDER_LEN <= input.len() {
        if !input[cursor..].starts_with(PLACEHOLDER_PREFIX) {
            cursor += 1;
            continue;
        }

        let candidate_end = cursor + PLACEHOLDER_LEN;
        if !is_valid_placeholder_bytes(&input[cursor..candidate_end]) {
            cursor += 1;
            continue;
        }

        let placeholder = std::str::from_utf8(&input[cursor..candidate_end])
            .map_err(|_| deny_entry(mode, DenyReason::MalformedHeaders, None, Some(host)))?;
        let secret = secret_table
            .by_placeholder
            .get(placeholder)
            .ok_or_else(|| {
                deny_entry(mode, DenyReason::PlaceholderOnNonAllowed, None, Some(host))
            })?;

        validate_secret_for_host(secret, host, mode)?;
        output.extend_from_slice(&input[last_copied..cursor]);
        output.extend_from_slice(secret.value.as_bytes());
        changed = true;
        cursor = candidate_end;
        last_copied = candidate_end;
    }

    if !changed {
        return Ok(None);
    }

    output.extend_from_slice(&input[last_copied..]);
    Ok(Some(output))
}

fn validate_secret_for_host(
    secret: &Secret,
    host: &str,
    mode: RewriteMode<'_>,
) -> Result<(), DenyLogEntry> {
    if !secret.allowed_domains.matches(host) {
        return Err(deny_entry(
            mode,
            DenyReason::PlaceholderOnNonAllowed,
            Some(&secret.name),
            Some(host),
        ));
    }

    Ok(())
}

fn is_valid_placeholder_bytes(value: &[u8]) -> bool {
    value.len() == PLACEHOLDER_LEN
        && value.starts_with(PLACEHOLDER_PREFIX)
        && value.ends_with(PLACEHOLDER_SUFFIX)
        && value[PLACEHOLDER_PREFIX.len()..PLACEHOLDER_PREFIX.len() + PLACEHOLDER_HEX_LEN]
            .iter()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(byte))
}

pub(super) fn normalized_authority(
    request: &RequestParts,
    authority: Authority<'_>,
    mode: RewriteMode<'_>,
) -> Result<String, DenyLogEntry> {
    let host = match authority {
        Authority::HostHeader => normalized_single_host(request, mode)?,
        Authority::Explicit { value } => {
            let host = normalize_host(value, mode.port())
                .map_err(|_| deny_entry(mode, DenyReason::MalformedHeaders, None, None))?;
            validate_host_headers_match(request, &host, mode)?;
            host
        }
    };

    if let RewriteMode::Tls { sni } = mode {
        let normalized_sni = normalize_host(sni, 443)
            .map_err(|_| deny_entry(mode, DenyReason::HostSniMismatch, None, Some(&host)))?;
        if normalized_sni != host {
            return Err(deny_entry(
                mode,
                DenyReason::HostSniMismatch,
                None,
                Some(&host),
            ));
        }
    }

    Ok(host)
}

fn normalized_single_host(
    request: &RequestParts,
    mode: RewriteMode<'_>,
) -> Result<String, DenyLogEntry> {
    let hosts = request
        .headers
        .iter()
        .filter(|header| header.name.eq_ignore_ascii_case("host"))
        .collect::<Vec<_>>();

    if hosts.is_empty() {
        return Err(deny_entry(mode, DenyReason::MissingHost, None, None));
    }
    if hosts.len() > 1 {
        return Err(deny_entry(mode, DenyReason::DuplicateHost, None, None));
    }

    let host_value = std::str::from_utf8(&hosts[0].value)
        .map_err(|_| deny_entry(mode, DenyReason::MalformedHeaders, None, None))?;
    normalize_host(host_value, mode.port())
        .map_err(|_| deny_entry(mode, DenyReason::MalformedHeaders, None, None))
}

fn validate_host_headers_match(
    request: &RequestParts,
    authority: &str,
    mode: RewriteMode<'_>,
) -> Result<(), DenyLogEntry> {
    for header in request
        .headers
        .iter()
        .filter(|header| header.name.eq_ignore_ascii_case("host"))
    {
        let value = std::str::from_utf8(&header.value)
            .map_err(|_| deny_entry(mode, DenyReason::MalformedHeaders, None, Some(authority)))?;
        let host = normalize_host(value, mode.port())
            .map_err(|_| deny_entry(mode, DenyReason::MalformedHeaders, None, Some(authority)))?;
        if host != authority {
            return Err(deny_entry(
                mode,
                DenyReason::HostSniMismatch,
                None,
                Some(&host),
            ));
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::is_unsafe_substitution_header;

    // Locks down the full blocklist membership: this set is the security
    // surface of the reflection-skip, so a fat-fingered edit that drops a
    // header should fail here rather than silently start leaking it.
    #[test]
    fn unsafe_header_blocklist_membership() {
        let unsafe_headers = [
            // Identity / referrer.
            "user-agent",
            "referer",
            "origin",
            "from",
            // Forwarding / proxy metadata.
            "x-forwarded-for",
            "x-forwarded-host",
            "x-forwarded-proto",
            "x-forwarded-port",
            "forwarded",
            "x-real-ip",
            "via",
            // Request-id / trace context.
            "x-request-id",
            "x-correlation-id",
            "request-id",
            "traceparent",
            "tracestate",
            "x-amzn-trace-id",
            "x-cloud-trace-context",
            "uber-trace-id",
            "b3",
            // Privacy / preference signals.
            "dnt",
            "sec-gpc",
            // Content negotiation (extended).
            "accept",
            "accept-encoding",
            "accept-language",
            "accept-charset",
            // Caching / conditional (extended).
            "cache-control",
            "pragma",
            "if-match",
            "if-none-match",
            "if-modified-since",
            "if-unmodified-since",
            "if-range",
            "range",
            // Prefix families.
            "sec-ch-ua",
            "sec-ch-ua-platform",
            "sec-fetch-site",
            "sec-fetch-mode",
            "x-b3-traceid",
            "x-b3-spanid",
            "x-datadog-trace-id",
            "x-datadog-parent-id",
        ];

        for header in unsafe_headers {
            assert!(
                is_unsafe_substitution_header(header),
                "expected {header} to be blocklisted"
            );
        }
    }

    #[test]
    fn credential_and_custom_headers_are_not_blocklisted() {
        for header in [
            "authorization",
            "cookie",
            "proxy-authorization",
            "x-api-key",
            "x-auth-token",
            "x-acme-token",
            "content-type",
        ] {
            assert!(
                !is_unsafe_substitution_header(header),
                "expected {header} to still substitute"
            );
        }
    }

    #[test]
    fn blocklist_match_is_case_insensitive() {
        assert!(is_unsafe_substitution_header("User-Agent"));
        assert!(is_unsafe_substitution_header("USER-AGENT"));
        assert!(is_unsafe_substitution_header("Sec-CH-UA"));
        assert!(is_unsafe_substitution_header("X-Datadog-Trace-Id"));
        assert!(!is_unsafe_substitution_header("Authorization"));
    }
}
