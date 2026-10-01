use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
    time::Instant,
};

use axum::{
    extract::{MatchedPath, Request, State},
    middleware::Next,
    response::Response,
};

#[derive(Default)]
struct Route {
    requests: u64,
    errors: u64,
    total_us: u64,
    max_us: u64,
}

/// @cc [owner:spolu,label:logging;security] bounded-route-metrics
/// Aggregate only registered route templates, never raw URLs, credentials, object IDs, or bodies.
/// Durations measure handler response preparation; streamed response-body transfer is excluded.
#[derive(Default)]
pub(super) struct Metrics(Mutex<BTreeMap<String, Route>>);

impl Metrics {
    pub fn log(&self) {
        if let Ok(routes) = self.0.lock() {
            for (route, metric) in routes.iter() {
                tracing::info!(
                    route,
                    requests = metric.requests,
                    errors = metric.errors,
                    handler_total_us = metric.total_us,
                    handler_max_us = metric.max_us,
                    "dfs API metrics"
                );
            }
        }
    }
}

pub(super) async fn record(
    State(metrics): State<Arc<Metrics>>,
    request: Request,
    next: Next,
) -> Response {
    let route = request
        .extensions()
        .get::<MatchedPath>()
        .map(|path| path.as_str().to_owned());
    let started = Instant::now();
    let response = next.run(request).await;
    let elapsed_us = u64::try_from(started.elapsed().as_micros()).unwrap_or(u64::MAX);
    if let Some(route) = route
        && let Ok(mut routes) = metrics.0.lock()
    {
        let metric = routes.entry(route).or_default();
        metric.requests = metric.requests.saturating_add(1);
        metric.errors = metric
            .errors
            .saturating_add(u64::from(!response.status().is_success()));
        metric.total_us = metric.total_us.saturating_add(elapsed_us);
        metric.max_us = metric.max_us.max(elapsed_us);
    }
    response
}
