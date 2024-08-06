use axum::{
    body::{Body, Bytes},
    extract::Request,
    middleware::Next,
    response::Response,
};
use http::StatusCode;
use lazy_static::lazy_static;
use reqwest::Client;
use tracing::error;

lazy_static! {
    static ref SECONDARY_API_FORWARDING_ENABLED: bool =
        std::env::var("SECONDARY_API_FORWARDING_ENABLED")
            .map(|s| s == "true")
            .unwrap_or(false);
    static ref IS_SECONDARY: bool = std::env::var("IS_SECONDARY")
        .map(|s| s == "true")
        .unwrap_or(false);
    static ref CORE_SECONDARY_API_URL: String =
        std::env::var("CORE_SECONDARY_API").unwrap_or_default();
}

fn should_forward(req: &Request<Body>) -> bool {
    if *SECONDARY_API_FORWARDING_ENABLED && !*IS_SECONDARY {
        if CORE_SECONDARY_API_URL.is_empty() {
            error!("CORE_SECONDARY_API is not set");
        }
        // Forward all requests for paths that contain "/tables" or "/query_database"
        req.uri().path().contains("/tables") || req.uri().path().contains("/query_database")
    } else {
        false
    }
}

pub async fn forward_middleware(req: Request<Body>, next: Next) -> Result<Response, StatusCode> {
    if should_forward(&req) {
        let client = Client::new();
        let (parts, body) = req.into_parts();
        let body_bytes: Bytes = axum::body::to_bytes(body, usize::MAX)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        let new_url = format!(
            "{}{}",
            *CORE_SECONDARY_API_URL,
            parts.uri.path_and_query().map_or("", |x| x.as_str())
        );

        let mut new_req = client.request(parts.method, new_url).body(body_bytes);

        for (name, value) in parts.headers.iter() {
            new_req = new_req.header(name, value);
        }

        match new_req.send().await {
            Ok(response) => {
                let status = response.status();
                let headers = response.headers().clone();
                let body = response
                    .bytes()
                    .await
                    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

                let mut builder = Response::builder().status(status);
                let headers_mut = builder.headers_mut().unwrap();
                headers_mut.extend(headers);

                builder
                    .body(Body::from(body))
                    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
            }
            Err(_) => Err(StatusCode::INTERNAL_SERVER_ERROR),
        }
    } else {
        Ok(next.run(req).await)
    }
}
