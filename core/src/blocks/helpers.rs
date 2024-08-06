use super::block::Env;
use crate::filter::SearchFilter;
use crate::project::Project;
use anyhow::{anyhow, Result};
use hyper::body::Buf;
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use std::io::prelude::*;
use url::Url;
use urlencoding::encode;

#[derive(Debug, Serialize, Deserialize, Clone)]
struct FrontRegistryPayload {
    data_source_id: String,
    project_id: i64,
    view_filter: Option<SearchFilter>,
}

pub async fn get_data_source_project_and_view_filter(
    workspace_id: &String,
    data_source_id: &String,
    env: &Env,
    origin: &str,
) -> Result<(Project, Option<SearchFilter>, String)> {
    let dust_workspace_id = match env.credentials.get("DUST_WORKSPACE_ID") {
        None => Err(anyhow!(
            "DUST_WORKSPACE_ID credentials missing, but `workspace_id` \
               is set in `data_source` block config"
        ))?,
        Some(v) => v.clone(),
    };
    let dust_group_ids = match env.credentials.get("DUST_GROUP_IDS") {
        Some(v) => v.clone(),
        // We default to the empty string if not set which will default to the workspace global
        // group in front registry.
        None => "".to_string(),
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

    let res = reqwest::Client::new()
        .get(parsed_url.as_str())
        .header(
            "Authorization",
            format!("Bearer {}", registry_secret.as_str()),
        )
        .header("X-Dust-Workspace-Id", dust_workspace_id)
        .header("X-Dust-Group-Ids", dust_group_ids)
        .header("X-Dust-Origin", origin)
        .send()
        .await?;

    let status = res.status();
    if status != StatusCode::OK {
        Err(anyhow!(
            "Failed to retrieve DataSource `{} > {}`",
            workspace_id,
            data_source_id,
        ))?;
    }

    let body = res.bytes().await?;

    let mut b: Vec<u8> = vec![];
    body.reader().read_to_end(&mut b)?;

    let response_body = String::from_utf8_lossy(&b).into_owned();

    // parse body into FrontRegistryPayload
    let payload: FrontRegistryPayload = match serde_json::from_str(&response_body) {
        Ok(payload) => payload,
        Err(_) => Err(anyhow!("Failed to parse registry response"))?,
    };

    Ok((
        Project::new_from_id(payload.project_id),
        payload.view_filter,
        payload.data_source_id,
    ))
}
