use opentelemetry::logs::{AnyValue, LogRecord, Logger, LoggerProvider};
use opentelemetry::{Key, Context};
use opentelemetry::trace::TraceContextExt;
use opentelemetry_appender_tracing::layer;
use opentelemetry_sdk::logs::SdkLoggerProvider;
use std::collections::HashMap;
use tracing_subscriber::{registry::LookupSpan, Layer};

/// Custom OTEL layer that enriches logs with JsonStorageLayer data
/// This approach reuses as much of the standard OTEL layer logic as possible,
/// only adding the span context enrichment on top
pub struct EnrichedOtelLayer {
    inner: layer::OpenTelemetryTracingBridge<SdkLoggerProvider, opentelemetry_sdk::logs::SdkLogger>,
    logger_provider: SdkLoggerProvider,
}

impl EnrichedOtelLayer {
    pub fn new(provider: &SdkLoggerProvider) -> Self {
        Self {
            inner: layer::OpenTelemetryTracingBridge::new(provider),
            logger_provider: provider.clone(),
        }
    }
    
    pub fn with_filter<F, S>(self, filter: F) -> tracing_subscriber::filter::Filtered<Self, F, S>
    where 
        F: tracing_subscriber::layer::Filter<S>,
        S: tracing::Subscriber,
    {
        tracing_subscriber::filter::Filtered::new(self, filter)
    }
}

impl<S> Layer<S> for EnrichedOtelLayer
where
    S: tracing::Subscriber + for<'lookup> LookupSpan<'lookup>,
{
    fn on_event(&self, event: &tracing::Event<'_>, ctx: tracing_subscriber::layer::Context<'_, S>) {
        // Check if we have span context to enrich with
        if let Some(span) = ctx.lookup_current() {
            let extensions = span.extensions();
            let extracted_fields = extract_span_fields(&extensions);
            
            // If we have span context fields, create an enriched log
            // Otherwise, fall back to the standard OTEL layer
            if !extracted_fields.is_empty() {
                self.create_enriched_otel_log(event, &extracted_fields);
                return;
            }
        }
        
        // Fallback: use standard OTEL layer processing
        self.inner.on_event(event, ctx);
    }
}

impl EnrichedOtelLayer {
    /// Create an enriched OTEL log that reuses standard OTEL layer logic + adds span context
    fn create_enriched_otel_log(&self, event: &tracing::Event<'_>, span_fields: &HashMap<String, String>) {
        let logger = self.logger_provider.logger("enriched_dust_api");
        
        // === REUSE: Standard OTEL layer event processing logic ===
        let metadata = event.metadata();
        let level = match *metadata.level() {
            tracing::Level::ERROR => opentelemetry::logs::Severity::Error,
            tracing::Level::WARN => opentelemetry::logs::Severity::Warn,
            tracing::Level::INFO => opentelemetry::logs::Severity::Info,
            tracing::Level::DEBUG => opentelemetry::logs::Severity::Debug,
            tracing::Level::TRACE => opentelemetry::logs::Severity::Trace,
        };
        
        // === REUSE: Standard OTEL layer field collection ===
        let mut event_fields = HashMap::new();
        let mut visitor = FieldCollector::new(&mut event_fields);
        event.record(&mut visitor);
        let message = event_fields.get("message").unwrap_or(&"<no message>".to_string()).clone();
        
        // === REUSE: Standard OTEL layer log record creation ===
        let mut log_record = logger.create_log_record();
        log_record.set_severity_text(metadata.level().as_str());
        log_record.set_severity_number(level);
        log_record.set_body(AnyValue::from(message));
        
        // === REUSE: Standard OTEL layer trace context preservation ===
        let current_context = Context::current();
        let current_span = current_context.span();
        let span_context = current_span.span_context();
        if span_context.is_valid() {
            log_record.set_trace_context(
                span_context.trace_id(),
                span_context.span_id(),
                Some(span_context.trace_flags()),
            );
        }

        // === REUSE: Standard OTEL layer attribute addition ===
        for (key, value) in event_fields.iter() {
            if key != "message" {
                log_record.add_attribute(Key::new(key.clone()), AnyValue::from(value.clone()));
            }
        }

        // === ENHANCEMENT: Add span context fields (our only addition) ===
        for (key, value) in span_fields.iter() {
            if !value.is_empty() {
                log_record.add_attribute(Key::new(key.clone()), AnyValue::from(value.clone()));
            }
        }

        // === REUSE: Standard OTEL layer log emission ===
        logger.emit(log_record);
    }
}

/// Extract fields from JsonStorage (our span context extraction logic)
fn extract_span_fields(extensions: &tracing_subscriber::registry::Extensions) -> HashMap<String, String> {
    let mut fields = HashMap::new();

    if let Some(storage) = extensions.get::<tracing_bunyan_formatter::JsonStorage>() {
        let stored_values = storage.values();

        let useful_fields = [
            // HTTP context (missing from OTEL)
            "http.route",
            "http.request.method",
            "url.path",
            "user_agent.original",
            // Server context (missing from OTEL)
            "server.address",
            "network.protocol.version",
            // OpenTelemetry span context (missing from OTEL)
            "otel.kind", 
            "otel.name",
            "span.type",
        ];
        for field_name in useful_fields.iter() {
            if let Some(field_value) = stored_values.get(*field_name) {
                if let Some(field_str) = field_value.as_str() {
                    if !field_str.is_empty() {
                        fields.insert(field_name.to_string(), field_str.to_string());
                    }
                }
            }
        }
    }

    fields
}

/// Field collector (reused from standard OTEL layer logic)
struct FieldCollector<'a> {
    fields: &'a mut HashMap<String, String>,
}

impl<'a> FieldCollector<'a> {
    fn new(fields: &'a mut HashMap<String, String>) -> Self {
        Self { fields }
    }
}

impl tracing::field::Visit for FieldCollector<'_> {
    fn record_debug(&mut self, field: &tracing::field::Field, value: &dyn std::fmt::Debug) {
        self.fields.insert(field.name().to_string(), format!("{:?}", value));
    }

    fn record_str(&mut self, field: &tracing::field::Field, value: &str) {
        self.fields.insert(field.name().to_string(), value.to_string());
    }
}