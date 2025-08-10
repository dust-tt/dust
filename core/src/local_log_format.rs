use std::{fmt, sync::LazyLock, time::Instant};
use tracing::Event;
use tracing_subscriber::{
    field::Visit,
    fmt::{format::Writer, FormatEvent, FormatFields},
};

/// Start time for uptime calculation
static START_TIME: LazyLock<Instant> = LazyLock::new(Instant::now);

/// Custom field formatter that removes "message=" prefix and greys out field names
pub struct LocalDevFields;

impl LocalDevFields {
    pub fn new() -> Self {
        Self
    }
}

impl<'writer> FormatFields<'writer> for LocalDevFields {
    fn format_fields<R: tracing_subscriber::field::RecordFields>(
        &self,
        writer: Writer<'writer>,
        fields: R,
    ) -> fmt::Result {
        let mut visitor = LocalDevFieldVisitor::new(writer);
        fields.record(&mut visitor);
        visitor.finish()
    }
}

struct LocalDevFieldVisitor<'writer> {
    writer: Writer<'writer>,
    result: fmt::Result,
}

impl<'writer> LocalDevFieldVisitor<'writer> {
    fn new(writer: Writer<'writer>) -> Self {
        Self {
            writer,
            result: Ok(()),
        }
    }

    fn finish(self) -> fmt::Result {
        self.result
    }
}

impl<'writer> Visit for LocalDevFieldVisitor<'writer> {
    fn record_debug(&mut self, field: &tracing::field::Field, value: &dyn fmt::Debug) {
        if self.result.is_ok() {
            if field.name() == "message" {
                self.result = write!(self.writer, "{:?} ", value);
            } else {
                self.result = write!(self.writer, "\x1b[90m{}=\x1b[0m{:?} ", field.name(), value);
            }
        }
    }
}

/// Custom event formatter for local development with colored levels and greyed metadata
pub struct LocalDevEventFormatter;

impl<S, N> FormatEvent<S, N> for LocalDevEventFormatter
where
    S: tracing::Subscriber + for<'lookup> tracing_subscriber::registry::LookupSpan<'lookup>,
    N: for<'writer> FormatFields<'writer> + 'static,
{
    fn format_event(
        &self,
        ctx: &tracing_subscriber::fmt::FmtContext<'_, S, N>,
        mut writer: Writer<'_>,
        event: &Event<'_>,
    ) -> fmt::Result {
        let meta = event.metadata();

        // Write timestamp and level using uptime with colors
        let uptime = START_TIME.elapsed();
        let level_str = match *meta.level() {
            tracing::Level::ERROR => "\x1b[31mERROR\x1b[0m", // Red
            tracing::Level::WARN => "\x1b[33mWARN\x1b[0m",   // Yellow
            tracing::Level::INFO => "\x1b[32mINFO\x1b[0m",   // Green
            tracing::Level::DEBUG => "\x1b[34mDEBUG\x1b[0m", // Blue
            tracing::Level::TRACE => "\x1b[35mTRACE\x1b[0m", // Purple
        };
        write!(
            writer,
            "\x1b[90m{:>12.9}s\x1b[0m {} ",
            uptime.as_secs_f64(),
            level_str
        )?;

        // Write fields (message and others)
        ctx.field_format().format_fields(writer.by_ref(), event)?;

        // Write thread name and location at the end in grey
        if let Some(thread_name) = std::thread::current().name() {
            write!(writer, "\x1b[90mon {} \x1b[0m", thread_name)?;
        }

        if let (Some(file), Some(line)) = (meta.file(), meta.line()) {
            write!(writer, "\x1b[90mat {}:{}\x1b[0m", file, line)?;
        }

        writeln!(writer)
    }
}
