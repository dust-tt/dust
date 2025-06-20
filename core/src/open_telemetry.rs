use init_tracing_opentelemetry::Error;
use opentelemetry::trace::TracerProvider;
use opentelemetry_appender_tracing::layer;
use opentelemetry_otlp::LogExporter;
use opentelemetry_sdk::logs::SdkLoggerProvider;
use opentelemetry_sdk::trace::{SdkTracerProvider, Tracer};
use tracing::{info, level_filters::LevelFilter, Subscriber};
use tracing_bunyan_formatter::{BunyanFormattingLayer, JsonStorageLayer};
use tracing_opentelemetry::OpenTelemetryLayer;
use tracing_subscriber::{filter::EnvFilter, layer::SubscriberExt, registry::LookupSpan, Layer};

fn build_logger_text<S>() -> Box<dyn Layer<S> + Send + Sync + 'static>
where
    S: Subscriber + for<'a> LookupSpan<'a>,
{
    use tracing_subscriber::fmt::format::FmtSpan;
    if cfg!(debug_assertions) {
        Box::new(
            tracing_subscriber::fmt::layer()
                .pretty()
                .with_line_number(true)
                .with_thread_names(true)
                .with_span_events(FmtSpan::NEW | FmtSpan::CLOSE)
                .with_timer(tracing_subscriber::fmt::time::uptime()),
        )
    } else {
        Box::new(
            tracing_subscriber::fmt::layer()
                .json()
                //.with_span_events(FmtSpan::NEW | FmtSpan::CLOSE)
                .with_timer(tracing_subscriber::fmt::time::uptime()),
        )
    }
}

/// Read the configuration from (first non empty used, priority top to bottom):
///
/// - from parameter `directives`
/// - from environment variable `RUST_LOG`
/// - from environment variable `OTEL_LOG_LEVEL`
/// - default to `Level::INFO`
///
/// And add directive to:
///
/// - `otel::tracing` should be a level info to emit opentelemetry trace & span
///
/// You can customize parameter "directives", by adding:
///
/// - `otel::setup=debug` set to debug to log detected resources, configuration read (optional)
///
/// see [Directives syntax](https://docs.rs/tracing-subscriber/latest/tracing_subscriber/filter/struct.EnvFilter.html#directives)
pub fn build_level_filter_layer(log_directives: &str) -> Result<EnvFilter, Error> {
    let dirs = if log_directives.is_empty() {
        std::env::var("RUST_LOG")
            .or_else(|_| std::env::var("OTEL_LOG_LEVEL"))
            .unwrap_or_else(|_| "info".to_string())
    } else {
        log_directives.to_string()
    };
    let directive_to_allow_otel_trace = "otel::tracing=trace".parse()?;

    Ok(EnvFilter::builder()
        .with_default_directive(LevelFilter::INFO.into())
        .parse_lossy(dirs)
        .add_directive(directive_to_allow_otel_trace))
}

pub fn build_otel_layer<S>() -> Result<(OpenTelemetryLayer<S, Tracer>, TracingGuard), Error>
where
    S: Subscriber + for<'a> LookupSpan<'a>,
{
    use init_tracing_opentelemetry::{
        init_propagator, //stdio,
        otlp,
        resource::DetectResource,
    };
    use opentelemetry::global;
    let otel_rsrc = DetectResource::default().build();
    let tracer_provider = otlp::init_tracerprovider(otel_rsrc, otlp::identity)?;
    init_propagator()?;
    let layer = tracing_opentelemetry::layer()
        .with_error_records_to_exceptions(true)
        .with_tracer(tracer_provider.tracer("Dust OTLP tracer"));
    global::set_tracer_provider(tracer_provider.clone());
    Ok((layer, TracingGuard { tracer_provider }))
}

/// On Drop of the `TracingGuard` instance,
/// the wrapped Tracer Provider is force to flush and to shutdown (ignoring error).
#[must_use = "Recommend holding with 'let _guard = ' pattern to ensure final traces are sent to the server"]
pub struct TracingGuard {
    tracer_provider: SdkTracerProvider,
}

impl TracingGuard {
    /// the wrapped Tracer Provider
    #[must_use]
    pub fn tracer_provider(&self) -> &impl TracerProvider {
        &self.tracer_provider
    }
}

impl Drop for TracingGuard {
    fn drop(&mut self) {
        #[allow(unused_must_use)]
        let _ = self.tracer_provider.force_flush();
        let _ = self.tracer_provider.shutdown();
    }
}

pub fn init_subscribers() -> Result<TracingGuard, Error> {
    init_subscribers_and_loglevel("")
}

/// see [`build_level_filter_layer`] for the syntax of `log_directives`
pub fn init_subscribers_and_loglevel(log_directives: &str) -> Result<TracingGuard, Error> {
    //setup a temporary subscriber to log output during setup
    let subscriber = tracing_subscriber::registry()
        .with(build_level_filter_layer(log_directives)?)
        .with(build_logger_text());
    let _guard = tracing::subscriber::set_default(subscriber);
    info!("init logging & tracing");

    let (layer, guard) = build_otel_layer()?;

    let exporter = LogExporter::builder()
        .with_tonic()
        .build()
        .expect("failed to install logging");
    let provider: SdkLoggerProvider = opentelemetry_sdk::logs::SdkLoggerProvider::builder()
        .with_batch_exporter(exporter)
        .build();

    // To prevent a telemetry-induced-telemetry loop, OpenTelemetry's own internal
    // logging is properly suppressed. However, logs emitted by external components
    // (such as reqwest, tonic, etc.) are not suppressed as they do not propagate
    // OpenTelemetry context. Until this issue is addressed
    // (https://github.com/open-telemetry/opentelemetry-rust/issues/2877),
    // filtering like this is the best way to suppress such logs.
    //
    // The filter levels are set as follows:
    // - Allow `info` level and above by default.
    // - Completely restrict logs from `hyper`, `tonic`, `h2`, and `reqwest`.
    //
    // Note: This filtering will also drop logs from these components even when
    // they are used outside of the OTLP Exporter.
    let filter_otel = EnvFilter::new("info")
        .add_directive("hyper=off".parse().unwrap())
        .add_directive("tonic=off".parse().unwrap())
        .add_directive("h2=off".parse().unwrap())
        .add_directive("reqwest=off".parse().unwrap());
    let otel_layer = layer::OpenTelemetryTracingBridge::new(&provider).with_filter(filter_otel);

    let subscriber = tracing_subscriber::registry()
        .with(JsonStorageLayer)
        .with(
            BunyanFormattingLayer::new("dust_api".into(), std::io::stdout)
                .skip_fields(vec!["file", "line", "target"].into_iter())
                .unwrap(),
        )
        .with(otel_layer)
        .with(layer)
        .with(build_level_filter_layer(log_directives)?)
        .with(build_logger_text());
    tracing::subscriber::set_global_default(subscriber)?;

    Ok(guard)
}
