//! Thin wasm-bindgen wrapper around `engine-core`. Zero logic lives here —
//! conversions at the edge only (spec §2.1).
//!
//! Handle-based API: `open_start()` allocates a handle, bytes stream in via
//! `append_chunk`, `open_finish` parses. Every open without a `close` leaks —
//! the TS client owns lifecycle (unmount + FinalizationRegistry backstop).
//!
//! Panic policy: stable `wasm32-unknown-unknown` forces `panic = "abort"`
//! semantics (no unwinding), so `std::panic::catch_unwind` cannot catch here.
//! A panic becomes a wasm trap that surfaces as a JS `RuntimeError` in the
//! worker; the worker shim maps it to a typed `INTERNAL` error and recycles
//! the instance. Native tests assert the engine never panics on the evil
//! corpus, making this a defense-in-depth path, not a load-bearing one.

use std::cell::RefCell;
use std::collections::HashMap;

use engine_core::{
    canonical, csv, search, viewport, workbook, xlsx, EngineError, OpenOptions, Workbook,
};
use wasm_bindgen::prelude::*;

enum Slot {
    Building {
        bytes: Vec<u8>,
        opts: OpenOptions,
        file_name: String,
    },
    Open(Box<Workbook>),
}

thread_local! {
    static SLOTS: RefCell<HashMap<u32, Slot>> = RefCell::new(HashMap::new());
    static NEXT_HANDLE: RefCell<u32> = const { RefCell::new(1) };
}

fn err_to_js(e: &EngineError) -> JsValue {
    let payload = serde_json::json!({ "code": e.code(), "detail": e.detail() });
    JsValue::from_str(&payload.to_string())
}

fn internal_err(msg: &str) -> JsValue {
    err_to_js(&EngineError::Internal(msg.to_string()))
}

fn to_json_js<T: serde::Serialize>(value: &T) -> Result<JsValue, JsValue> {
    // JSON-string transport: structured-clone-safe, schema owned by TS layer.
    serde_json::to_string(value)
        .map(|s| JsValue::from_str(&s))
        .map_err(|e| internal_err(&format!("serialize: {e}")))
}

#[wasm_bindgen]
pub fn init_panic_hook() {
    #[cfg(debug_assertions)]
    console_error_panic_hook::set_once();
}

/// Allocate a workbook handle in streaming-open state.
#[wasm_bindgen]
pub fn open_start(file_name: String, opts_json: Option<String>) -> Result<u32, JsValue> {
    let mut opts = OpenOptions::default();
    if let Some(json) = opts_json {
        let parsed: serde_json::Value =
            serde_json::from_str(&json).map_err(|e| internal_err(&format!("bad options: {e}")))?;
        if let Some(v) = parsed.get("maxBytes").and_then(|v| v.as_u64()) {
            opts.max_bytes = v;
        }
        if let Some(v) = parsed.get("maxCellsPerSheet").and_then(|v| v.as_u64()) {
            opts.max_cells_per_sheet = v.min(u32::MAX as u64) as u32;
        }
        if let Some(v) = parsed.get("maxTotalCells").and_then(|v| v.as_u64()) {
            opts.max_total_cells = v;
        }
    }
    let handle = NEXT_HANDLE.with(|h| {
        let mut h = h.borrow_mut();
        let v = *h;
        *h += 1;
        v
    });
    SLOTS.with(|slots| {
        slots.borrow_mut().insert(
            handle,
            Slot::Building {
                bytes: Vec::new(),
                opts,
                file_name,
            },
        )
    });
    Ok(handle)
}

/// Append a chunk of file bytes. Chunked appends and a single one-shot append
/// are byte-equivalent by construction (same buffer).
#[wasm_bindgen]
pub fn append_chunk(handle: u32, chunk: &[u8]) -> Result<(), JsValue> {
    SLOTS.with(|slots| {
        let mut slots = slots.borrow_mut();
        match slots.get_mut(&handle) {
            Some(Slot::Building { bytes, opts, .. }) => {
                if bytes.len() as u64 + chunk.len() as u64 > opts.max_bytes {
                    return Err(err_to_js(&EngineError::BudgetExceeded(
                        engine_core::BudgetKind::Bytes,
                    )));
                }
                bytes.extend_from_slice(chunk);
                Ok(())
            }
            Some(Slot::Open(_)) => Err(internal_err("append_chunk after open_finish")),
            None => Err(internal_err("unknown handle")),
        }
    })
}

/// Parse the accumulated bytes. Returns workbook metadata JSON.
#[wasm_bindgen]
pub fn open_finish(handle: u32) -> Result<JsValue, JsValue> {
    let (bytes, opts, file_name) = SLOTS.with(|slots| {
        let mut slots = slots.borrow_mut();
        match slots.remove(&handle) {
            Some(Slot::Building {
                bytes,
                opts,
                file_name,
            }) => Ok((bytes, opts, file_name)),
            Some(slot @ Slot::Open(_)) => {
                slots.insert(handle, slot);
                Err(internal_err("open_finish called twice"))
            }
            None => Err(internal_err("unknown handle")),
        }
    })?;

    let workbook = engine_core::open_auto(bytes, opts, &file_name).map_err(|e| err_to_js(&e))?;
    let meta = workbook.metadata();
    SLOTS.with(|slots| {
        slots
            .borrow_mut()
            .insert(handle, Slot::Open(Box::new(workbook)))
    });
    to_json_js(&meta)
}

fn with_workbook<T>(
    handle: u32,
    f: impl FnOnce(&mut Workbook) -> Result<T, JsValue>,
) -> Result<T, JsValue> {
    SLOTS.with(|slots| {
        let mut slots = slots.borrow_mut();
        match slots.get_mut(&handle) {
            Some(Slot::Open(wb)) => f(wb),
            Some(Slot::Building { .. }) => Err(internal_err("workbook not finished opening")),
            None => Err(internal_err("unknown handle")),
        }
    })
}

#[wasm_bindgen]
pub fn get_metadata(handle: u32) -> Result<JsValue, JsValue> {
    with_workbook(handle, |wb| to_json_js(&wb.metadata()))
}

/// Lazily parse + return sheet metadata.
#[wasm_bindgen]
pub fn activate_sheet(handle: u32, sheet: u32) -> Result<JsValue, JsValue> {
    with_workbook(handle, |wb| {
        wb.activate(sheet as usize).map_err(|e| err_to_js(&e))?;
        let meta = wb.metadata();
        let sheet_meta = meta
            .sheets
            .get(sheet as usize)
            .ok_or_else(|| internal_err("sheet index out of range"))?;
        to_json_js(sheet_meta)
    })
}

#[wasm_bindgen]
pub fn get_viewport(
    handle: u32,
    sheet: u32,
    row_start: u32,
    row_end: u32,
    col_start: u32,
    col_end: u32,
    mode: String,
) -> Result<JsValue, JsValue> {
    let mode = if mode == "formula" {
        viewport::DisplayMode::Formula
    } else {
        viewport::DisplayMode::Value
    };
    with_workbook(handle, |wb| {
        wb.activate(sheet as usize).map_err(|e| err_to_js(&e))?;
        let slice =
            viewport::get_viewport(wb, sheet, (row_start, row_end), (col_start, col_end), mode);
        to_json_js(&slice)
    })
}

/// Kit-shaped row batches (`getRowsBatchAsync` contract).
#[wasm_bindgen]
pub fn get_rows_batch(
    handle: u32,
    sheet: u32,
    start_row: u32,
    row_count: u32,
) -> Result<JsValue, JsValue> {
    with_workbook(handle, |wb| {
        wb.activate(sheet as usize).map_err(|e| err_to_js(&e))?;
        let rows = viewport::get_rows_batch(wb, sheet, start_row, row_count);
        to_json_js(&rows)
    })
}

/// Style-table slice for a sheet (the adapter maps indices -> kit style objects).
#[wasm_bindgen]
pub fn get_styles(handle: u32) -> Result<JsValue, JsValue> {
    with_workbook(handle, |wb| to_json_js(&wb.styles.styles))
}

/// Full sheet geometry (width/height overrides, hidden rows/cols, frozen
/// panes) — the React adapter materializes the kit's axis arrays from this.
/// Activates the sheet if needed.
#[wasm_bindgen]
pub fn get_sheet_geometry(handle: u32, sheet: u32) -> Result<JsValue, JsValue> {
    with_workbook(handle, |wb| {
        wb.activate(sheet as usize).map_err(|e| err_to_js(&e))?;
        let s = wb
            .sheet(sheet as usize)
            .ok_or_else(|| internal_err("sheet not loaded"))?;
        to_json_js(&s.dims)
    })
}

#[wasm_bindgen]
pub fn search(handle: u32, query: String, opts_json: Option<String>) -> Result<JsValue, JsValue> {
    let opts: search::SearchOpts = match opts_json {
        Some(json) => serde_json::from_str(&json)
            .map_err(|e| internal_err(&format!("bad search opts: {e}")))?,
        None => search::SearchOpts::default(),
    };
    with_workbook(handle, |wb| to_json_js(&search::search(wb, &query, &opts)))
}

/// Canonical JSON of the whole workbook (activates all sheets). Test/debug
/// surface for the determinism gate; not used by the viewer path.
#[wasm_bindgen]
pub fn canonical_json(handle: u32) -> Result<String, JsValue> {
    with_workbook(handle, |wb| {
        wb.activate_all().map_err(|e| err_to_js(&e))?;
        Ok(canonical::canonical_json(wb))
    })
}

/// Free the workbook. Idempotent.
#[wasm_bindgen]
pub fn close(handle: u32) {
    SLOTS.with(|slots| {
        slots.borrow_mut().remove(&handle);
    });
}

/// Number of live handles (leak assertions in tests).
#[wasm_bindgen]
pub fn open_handle_count() -> u32 {
    SLOTS.with(|slots| slots.borrow().len() as u32)
}

/// Current wasm linear-memory size in 64 KiB pages. Used by the leak test:
/// page count must stop growing across repeated open/close cycles.
#[wasm_bindgen]
pub fn memory_pages() -> u32 {
    #[cfg(target_arch = "wasm32")]
    {
        core::arch::wasm32::memory_size(0) as u32
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        0
    }
}

// Re-exports referenced by the doc comment; keeps `cargo doc` honest about
// the modules this wrapper surfaces.
#[allow(unused_imports)]
use workbook as _workbook_mod;
#[allow(unused_imports)]
use {csv as _csv_mod, xlsx as _xlsx_mod};
