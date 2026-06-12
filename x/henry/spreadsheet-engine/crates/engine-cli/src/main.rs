//! Native CLI: parse a spreadsheet file to canonical JSON. Used by the
//! determinism gate (triple-run hash compare) and for debugging.
//!
//! Usage: engine-cli parse <file> [--max-cells-per-sheet N] [--max-total-cells N]

use std::io::Write;
use std::process::ExitCode;

use engine_core::{canonical, open_auto, OpenOptions};

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 3 || args[1] != "parse" {
        eprintln!("usage: engine-cli parse <file> [--max-cells-per-sheet N] [--max-total-cells N]");
        return ExitCode::from(2);
    }
    let path = &args[2];
    // Strict flag parsing: this binary feeds a byte-hash determinism gate,
    // so silently running with a different budget is the worst failure mode.
    let mut opts = OpenOptions::default();
    let mut i = 3;
    while i < args.len() {
        let Some(value) = args.get(i + 1) else {
            eprintln!("flag {} requires a value", args[i]);
            return ExitCode::from(2);
        };
        match args[i].as_str() {
            "--max-cells-per-sheet" => match value.parse() {
                Ok(v) => opts.max_cells_per_sheet = v,
                Err(_) => {
                    eprintln!("invalid value for --max-cells-per-sheet: {value}");
                    return ExitCode::from(2);
                }
            },
            "--max-total-cells" => match value.parse() {
                Ok(v) => opts.max_total_cells = v,
                Err(_) => {
                    eprintln!("invalid value for --max-total-cells: {value}");
                    return ExitCode::from(2);
                }
            },
            other => {
                eprintln!("unknown flag: {other}");
                return ExitCode::from(2);
            }
        }
        i += 2;
    }

    let bytes = match std::fs::read(path) {
        Ok(b) => b,
        Err(e) => {
            eprintln!("cannot read {path}: {e}");
            return ExitCode::from(1);
        }
    };

    match open_auto(bytes, opts, path) {
        Ok(mut workbook) => {
            if let Err(e) = workbook.activate_all() {
                emit_error(&e);
                return ExitCode::from(1);
            }
            let json = canonical::canonical_json(&workbook);
            // Write raw bytes: stdout must be byte-identical across runs.
            let mut stdout = std::io::stdout().lock();
            if stdout.write_all(json.as_bytes()).is_err() {
                return ExitCode::from(1);
            }
            ExitCode::SUCCESS
        }
        Err(e) => {
            emit_error(&e);
            ExitCode::from(1)
        }
    }
}

/// Typed errors print as stable single-line JSON on stdout (so evil-corpus
/// expectations can be golden-tested), with a nonzero exit code.
fn emit_error(e: &engine_core::EngineError) {
    let json = serde_json::json!({ "error": { "code": e.code(), "detail": e.detail() } });
    let mut out = serde_json::to_string(&json).unwrap_or_default();
    out.push('\n');
    let _ = std::io::stdout().lock().write_all(out.as_bytes());
}
