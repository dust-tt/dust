use std::collections::HashMap;

use anyhow::{ensure, Result};

use crate::egress_secrets::{DomainSet, Secret, SecretTable};

pub(super) async fn read_h2_body(mut body: h2::RecvStream) -> Result<Vec<u8>> {
    let mut output = Vec::new();
    while let Some(chunk) = body.data().await {
        let chunk = chunk?;
        output.extend_from_slice(&chunk);
        body.flow_control().release_capacity(chunk.len())?;
    }
    ensure!(body.trailers().await?.is_none(), "unexpected trailers");
    Ok(output)
}

pub(super) fn empty_table() -> Result<SecretTable> {
    secret_table(&[])
}

pub(super) fn secret_table(patterns: &[&str]) -> Result<SecretTable> {
    let allowed_domains = patterns
        .iter()
        .map(|pattern| (*pattern).to_string())
        .collect::<Vec<_>>();
    Ok(SecretTable {
        by_placeholder: HashMap::new(),
        sni_match_set: DomainSet::from_patterns(&allowed_domains)?,
    })
}

pub(super) fn secret_table_with_secret(
    name: &str,
    placeholder: &str,
    value: &str,
    patterns: &[&str],
) -> Result<SecretTable> {
    let allowed_domains = patterns
        .iter()
        .map(|pattern| (*pattern).to_string())
        .collect::<Vec<_>>();
    let domain_set = DomainSet::from_patterns(&allowed_domains)?;
    let secret = Secret {
        name: name.to_string(),
        placeholder: placeholder.to_string(),
        value: value.to_string(),
        allowed_domains: domain_set,
    };
    let mut by_placeholder = HashMap::new();
    by_placeholder.insert(placeholder.to_string(), secret);
    Ok(SecretTable {
        by_placeholder,
        sni_match_set: DomainSet::from_patterns(&allowed_domains)?,
    })
}
