use base64::{engine::general_purpose, Engine as _};

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

#[allow(dead_code)]
pub(super) struct ProcessedPolicyRequest {
    pub host: String,
    pub headers: Vec<HeaderPart>,
}

#[allow(dead_code)]
pub(super) fn process_request_policy(
    request: &RequestParts,
    authority: Authority<'_>,
    secret_table: &SecretTable,
    mode: RewriteMode<'_>,
) -> Result<ProcessedPolicyRequest, DenyLogEntry> {
    validate_request_line_policy(request, mode)?;
    let host = normalized_authority(request, authority, mode)?;
    let headers = rewrite_request_headers(request, &host, secret_table, mode)?;

    Ok(ProcessedPolicyRequest { host, headers })
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
