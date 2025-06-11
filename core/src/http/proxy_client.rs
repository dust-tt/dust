use lazy_static::lazy_static;
use std::env;
use tracing::{error, info};

lazy_static! {
    static ref UNTRUSTED_EGRESS_PROXY: Option<String> = {
        match (
            env::var("UNTRUSTED_EGRESS_PROXY_HOST"),
            env::var("UNTRUSTED_EGRESS_PROXY_PORT"),
        ) {
            (Ok(host), Ok(port)) => {
                let proxy_url = format!("http://{}:{}", host, port);
                info!(
                    proxy_url = proxy_url.as_str(),
                    "Untrusted egress proxy configured"
                );
                Some(proxy_url)
            }
            _ => None,
        }
    };
}

/// Creates a reqwest client builder configured with the untrusted egress proxy if the
/// environment variables UNTRUSTED_EGRESS_PROXY_HOST and UNTRUSTED_EGRESS_PROXY_PORT are set.
/// The builder can be further customized before building the final client.
pub fn create_untrusted_egress_client_builder() -> reqwest::ClientBuilder {
    let mut builder = reqwest::Client::builder();

    if let Some(proxy_url) = UNTRUSTED_EGRESS_PROXY.as_ref() {
        match reqwest::Proxy::all(proxy_url) {
            Ok(proxy) => {
                builder = builder.proxy(proxy);
            }
            Err(e) => {
                error!(error = ?e, proxy_url = proxy_url.as_str(), "Failed to configure untrusted egress proxy");
            }
        }
    }

    builder
}
