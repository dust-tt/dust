use super::block::Env;
use crate::project::Project;
use anyhow::{anyhow, Result};
use hyper::header;
use hyper::{body::Buf, http::StatusCode, Body, Client, Method, Request};
use hyper_tls::HttpsConnector;
use serde_json::Value;
use std::io::prelude::*;
use url::Url;
use urlencoding::encode;

pub async fn get_data_source_project(
    workspace_id: &String,
    data_source_id: &String,
    env: &Env,
) -> Result<Project> {
    let dust_workspace_id = match env.credentials.get("DUST_WORKSPACE_ID") {
        None => Err(anyhow!(
            "DUST_WORKSPACE_ID credentials missing, but `workspace_id` \
               is set in `data_source` block config"
        ))?,
        Some(v) => v.clone(),
    };
    let registry_secret = match std::env::var("DUST_REGISTRY_SECRET") {
        Ok(key) => key,
        Err(_) => Err(anyhow!(
            "Environment variable `DUST_REGISTRY_SECRET` is not set."
        ))?,
    };
    let front_api = match std::env::var("DUST_FRONT_API") {
        Ok(key) => key,
        Err(_) => Err(anyhow!("Environment variable `DUST_FRONT_API` is not set."))?,
    };

    let url = format!(
        "{}/api/registry/data_sources/lookup?workspace_id={}&data_source_id={}",
        front_api.as_str(),
        encode(&workspace_id),
        encode(&data_source_id),
    );
    let parsed_url = Url::parse(url.as_str())?;

    let mut req = Request::builder().method(Method::GET).uri(url.as_str());

    {
        let headers = match req.headers_mut() {
            Some(h) => h,
            None => Err(anyhow!("Invalid URL: {}", url.as_str()))?,
        };
        headers.insert(
            header::AUTHORIZATION,
            header::HeaderValue::from_bytes(
                format!("Bearer {}", registry_secret.as_str()).as_bytes(),
            )?,
        );
        headers.insert(
            header::HeaderName::from_bytes("X-Dust-Workspace-Id".as_bytes())?,
            header::HeaderValue::from_bytes(dust_workspace_id.as_bytes())?,
        );
    }
    let req = req.body(Body::empty())?;

    let res = match parsed_url.scheme() {
        "https" => {
            let https = HttpsConnector::new();
            let cli = Client::builder().build::<_, hyper::Body>(https);
            cli.request(req).await?
        }
        "http" => {
            let cli = Client::new();
            cli.request(req).await?
        }
        _ => Err(anyhow!(
            "Only the `http` and `https` schemes are authorized."
        ))?,
    };

    let status = res.status();
    if status != StatusCode::OK {
        Err(anyhow!(
            "Failed to retrieve DataSource `{} > {}`",
            workspace_id,
            data_source_id,
        ))?;
    }

    let body = hyper::body::aggregate(res).await?;
    let mut b: Vec<u8> = vec![];
    body.reader().read_to_end(&mut b)?;

    let response_body = String::from_utf8_lossy(&b).into_owned();

    let body = match serde_json::from_str::<serde_json::Value>(&response_body) {
        Ok(body) => body,
        Err(_) => Err(anyhow!("Failed to parse registry response"))?,
    };

    match body.get("project_id") {
        Some(Value::Number(p)) => match p.as_i64() {
            Some(p) => Ok(Project::new_from_id(p)),
            None => Err(anyhow!("Failed to parse registry response")),
        },
        _ => Err(anyhow!("Failed to parse registry response")),
    }
}
