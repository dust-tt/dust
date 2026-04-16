#![allow(dead_code)] // PR 3 wires these primitives into the forward runtime.

mod deny_log;
mod handshake;
mod http_host;
mod sni;

#[derive(Debug, PartialEq, Eq)]
pub(super) enum DomainParseResult {
    Found(String),
    NotFound,
    Incomplete,
}
