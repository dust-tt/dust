use crate::http::network::NetworkUtils;
use anyhow::{anyhow, Result};
use reqwest::redirect::Policy;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::error::Error;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;

#[derive(Debug, Serialize, Deserialize)]
struct RequestSpec {
    #[serde(rename = "appId")]
    app_id: String,
    method: String,
    url: String,
    headers: Value,
    body: Value,
    scheme: Option<String>,
    #[serde(rename = "workspaceId")]
    workspace_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct RequestDetails {}

#[derive(Debug, Serialize)]
struct PrivateIPReport {
    app_id: String,
    workspace_id: String,
    url: String,
    error: String,
    redirect_chain: Vec<String>,
    timestamp: String,
}

// Create a custom error type to hold the redirect chain.
#[derive(Debug)]
struct RedirectError {
    error: anyhow::Error,
    redirect_chain: Vec<String>,
}

impl std::fmt::Display for RedirectError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.error)
    }
}

impl std::error::Error for RedirectError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        self.error.source()
    }
}

pub async fn analyze_requests_file(file_path: &Path) -> Result<()> {
    let file = File::open(file_path)?;
    let reader = BufReader::new(file);
    let mut reports = Vec::new();

    // Read and parse the file content.
    let content = reader
        .lines()
        .collect::<Result<Vec<String>, _>>()?
        .join("\n");

    let requests: Vec<RequestSpec> = serde_json::from_str(&content)?;

    for request in requests {
        if request.url.is_empty() {
            println!("Skipping empty URL");
            continue;
        }

        let full_url = format!(
            "{}://{}",
            match request.scheme {
                Some(scheme) => scheme,
                None => "http".to_string(),
            },
            request.url
        );
        println!("Checking URL: {}", full_url);

        // First check if the initial URL points to a private IP
        match NetworkUtils::check_url_for_private_ip(&full_url) {
            Ok(_) => {
                // Create the HTTP client with custom redirect policy
                let client = reqwest::Client::builder()
                    .redirect(Policy::custom(|attempt| {
                        // Log the redirect for debugging.
                        println!(
                            "Redirect attempt from: {:?} to: {}",
                            attempt.previous(),
                            attempt.url()
                        );

                        // Ensure the URL is not pointing to a private IP.
                        match NetworkUtils::check_url_for_private_ip(attempt.url().as_str()) {
                            Ok(_) => attempt.follow(),
                            Err(e) => {
                                println!("Attempt to follow redirect to private IP: {}", e);

                                // Get the redirect chain.
                                let mut redirect_chain: Vec<String> = attempt
                                    .previous()
                                    .iter()
                                    .map(|url| url.to_string())
                                    .collect();
                                redirect_chain.push(attempt.url().to_string());

                                // Return error with the redirect chain.
                                let redirect_error = RedirectError {
                                    error: e,
                                    redirect_chain: redirect_chain.clone(),
                                };

                                attempt.error(redirect_error)
                            }
                        }
                    }))
                    .build()
                    .map_err(|e| anyhow!("Failed to build HTTP client: {}", e))?;

                // Build and send the request
                let method = match request.method.as_str() {
                    "GET" => reqwest::Method::GET,
                    "POST" => reqwest::Method::POST,
                    "PUT" => reqwest::Method::PUT,
                    "PATCH" => reqwest::Method::PATCH,
                    _ => continue, // Skip unsupported methods
                };

                // Build request with headers.
                let mut req = client.request(method, &full_url);

                // Add headers if they exist.
                if let Value::Object(headers_obj) = &request.headers {
                    for (k, v) in headers_obj {
                        if let Value::String(v_str) = v {
                            req = req.header(k, v_str);
                        }
                    }
                }

                // Add body if it exists.
                let req = match &request.body {
                    Value::Object(body) => req.json(&body),
                    Value::String(body) => req.body(body.to_string()),
                    Value::Null => req,
                    _ => continue, // Skip invalid body types.
                };

                // Send the request and handle any errors
                match req.send().await {
                    Ok(_) => {}
                    Err(e) => {
                        // Check if the error contains our redirect information.
                        if let Some(redirect_err) =
                            e.source().and_then(|e| e.downcast_ref::<RedirectError>())
                        {
                            let report = PrivateIPReport {
                                app_id: request.app_id,
                                workspace_id: request.workspace_id,
                                url: full_url,
                                error: e.to_string(),
                                redirect_chain: redirect_err.redirect_chain.clone(),
                                timestamp: chrono::Utc::now().to_rfc3339(),
                            };
                            reports.push(report);
                        }
                    }
                }
            }
            Err(e) => {
                if e.to_string().contains("Forbidden IP range") {
                    let report = PrivateIPReport {
                        app_id: request.app_id,
                        workspace_id: request.workspace_id,
                        url: full_url,
                        error: e.to_string(),
                        redirect_chain: Vec::new(),
                        timestamp: chrono::Utc::now().to_rfc3339(),
                    };
                    reports.push(report);
                } else {
                    println!("Error: {}", e);
                }
            }
        }
    }

    // Write reports to a new file
    let output_path = file_path.with_extension("private_ips.json");
    println!("Found {} reports", reports.len());
    println!("Writing reports to {}", output_path.display());
    let output_file = File::create(output_path)?;
    serde_json::to_writer_pretty(output_file, &reports)?;

    Ok(())
}
