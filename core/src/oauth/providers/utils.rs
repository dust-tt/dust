use crate::{
    oauth::connection::{ConnectionProvider, PROVIDER_TIMEOUT_SECONDS},
    utils,
};
use anyhow::{anyhow, Result};
use hyper::body::Buf;
use reqwest::RequestBuilder;
use std::io::prelude::*;
use std::time::Duration;
use tokio::time::timeout;

pub async fn execute_request(
    provider: ConnectionProvider,
    req: RequestBuilder,
) -> Result<serde_json::Value> {
    let now = utils::now_secs();

    let res = match timeout(Duration::new(PROVIDER_TIMEOUT_SECONDS, 0), req.send()).await {
        Ok(Ok(res)) => res,
        Ok(Err(e)) => Err(e)?,
        Err(_) => Err(anyhow!("Timeout sending request: provider={}", provider))?,
    };

    if !res.status().is_success() {
        Err(anyhow!(
            "Error generating access token: provider={} status={}",
            provider,
            res.status().as_u16(),
        ))?;
    }

    let body = match timeout(
        Duration::new(PROVIDER_TIMEOUT_SECONDS - (utils::now_secs() - now), 0),
        res.bytes(),
    )
    .await
    {
        Ok(Ok(body)) => body,
        Ok(Err(e)) => Err(e)?,
        Err(_) => Err(anyhow!("Timeout reading response from Confluence"))?,
    };

    let mut b: Vec<u8> = vec![];
    body.reader().read_to_end(&mut b)?;
    let c: &[u8] = &b;

    let raw_json: serde_json::Value = serde_json::from_slice(c)?;

    Ok(raw_json)
}
