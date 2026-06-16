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
    static ref STATIC_IP_PROXY: Option<String> = {
        match (
            env::var("PROXY_HOST"),
            env::var("PROXY_PORT"),
            env::var("PROXY_USER_NAME"),
            env::var("PROXY_USER_PASSWORD"),
        ) {
            (Ok(host), Ok(port), Ok(user_name), Ok(password)) => {
                let proxy_url = format!("http://{}:{}@{}:{}", user_name, password, host, port);
                info!("Static IP proxy configured");
                Some(proxy_url)
            }
            _ => None,
        }
    };
}

/// Whether any egress proxy is configured. In deployed environments at least the untrusted egress
/// proxy is always set, so this doubles as a "are we running locally?" signal: when it returns
/// false, no `*_PROXY_*` env is set, which only happens in local development.
pub fn is_egress_proxy_configured() -> bool {
    STATIC_IP_PROXY.is_some() || UNTRUSTED_EGRESS_PROXY.is_some()
}

fn build_proxied_no_redirect(proxy_url: &str) -> Option<reqwest::Client> {
    let proxy = reqwest::Proxy::all(proxy_url)
        .map_err(|e| {
            error!(error = ?e, proxy_url, "Failed to configure proxy");
        })
        .ok()?;

    reqwest::Client::builder()
        .proxy(proxy)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| {
            error!(error = ?e, "Failed to create proxied client");
        })
        .ok()
}

/// Creates a reqwest client builder configured with the untrusted egress proxy if the
/// environment variables UNTRUSTED_EGRESS_PROXY_HOST and UNTRUSTED_EGRESS_PROXY_PORT are set.
/// The builder can be further customized before building the final client.
pub fn create_untrusted_egress_client_builder() -> reqwest::ClientBuilder {
    let mut builder = reqwest::Client::builder();

    if let Some(proxy_url) = UNTRUSTED_EGRESS_PROXY.as_deref() {
        match reqwest::Proxy::all(proxy_url) {
            Ok(proxy) => {
                builder = builder.proxy(proxy);
            }
            Err(e) => {
                error!(error = ?e, proxy_url, "Failed to configure untrusted egress proxy");
            }
        }
    }

    builder
}

pub fn try_build_static_ip_client() -> Option<reqwest::Client> {
    build_proxied_no_redirect(STATIC_IP_PROXY.as_deref()?)
}

pub fn try_build_untrusted_egress_client() -> Option<reqwest::Client> {
    build_proxied_no_redirect(UNTRUSTED_EGRESS_PROXY.as_deref()?)
}

/// Builds a direct (un-proxied) client with redirects disabled. Used as a last-resort fallback when
/// no egress proxy is configured (e.g. local development) so MCP OAuth flows keep working.
pub fn try_build_direct_client() -> Option<reqwest::Client> {
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| {
            error!(error = ?e, "Failed to create direct client");
        })
        .ok()
}

#[cfg(test)]
mod tests {
    use super::build_proxied_no_redirect;

    #[test]
    fn build_proxied_no_redirect_rejects_malformed_proxy_url() {
        assert!(build_proxied_no_redirect("not a proxy url").is_none());
    }

    #[test]
    fn build_proxied_no_redirect_accepts_valid_proxy_url() {
        assert!(build_proxied_no_redirect("http://127.0.0.1:1").is_some());
    }
}
