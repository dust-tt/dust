use crate::{model::Record, read::View, storage::failed};
use arrow_array::{
    ArrayRef, BooleanArray, Int64Array, RecordBatch, RecordBatchIterator, StringArray, UInt32Array,
    UInt64Array,
    builder::{ListBuilder, StringBuilder},
};
use arrow_schema::{DataType, Field, Schema};
use base64::{Engine, engine::general_purpose::STANDARD};
use dfs_protocol::BLOCK_SIZE;
use lancedb::{
    Table,
    expr::{col, lit},
    index::{Index, scalar::FtsIndexBuilder},
};
use slatedb::config::ReadOptions;
use std::sync::Arc;
use tonic::Status;

pub(super) const MAX_TEXT: u64 = 8 * 1024 * 1024;
pub(super) struct Document {
    pub record: Record,
    pub text: String,
    pub skipped: bool,
}

// Encode each component separately so empty values and component boundaries remain distinct.
pub(super) fn label(parts: &[&[u8]]) -> String {
    let mut bytes = Vec::new();
    for part in parts {
        bytes.extend_from_slice(&(part.len() as u64).to_be_bytes());
        bytes.extend_from_slice(part);
    }
    STANDARD.encode(bytes)
}

pub(super) fn schema() -> Arc<Schema> {
    Arc::new(Schema::new(vec![
        Field::new("object_id", DataType::Utf8, false),
        Field::new("object_version", DataType::UInt64, false),
        Field::new("name", DataType::Utf8, false),
        Field::new("mime_type", DataType::Utf8, false),
        Field::new("size", DataType::UInt64, false),
        Field::new("mtime_seconds", DataType::Int64, false),
        Field::new("mtime_nanos", DataType::UInt32, false),
        Field::new("mode", DataType::UInt32, false),
        Field::new("text", DataType::Utf8, false),
        Field::new("excerpt", DataType::Utf8, false),
        Field::new("skipped", DataType::Boolean, false),
        Field::new(
            "xattr_keys",
            DataType::List(Arc::new(Field::new("item", DataType::Utf8, true))),
            false,
        ),
        Field::new(
            "xattr_values",
            DataType::List(Arc::new(Field::new("item", DataType::Utf8, true))),
            false,
        ),
    ]))
}

pub(super) async fn extract(view: &View, record: Record) -> Result<Document, Status> {
    let object = &record.object;
    let mime = object.mime_type.split(';').next().unwrap_or("").trim();
    let supported = mime.starts_with("text/")
        || matches!(
            mime,
            "application/json"
                | "application/javascript"
                | "application/xml"
                | "application/x-sh"
                | "application/octet-stream"
        );
    let mut skipped = !supported || object.size > MAX_TEXT;
    let mut bytes = Vec::new();
    if !skipped {
        bytes.resize(object.size as usize, 0);
        for index in 0..object.size.div_ceil(BLOCK_SIZE as u64) {
            let start = index as usize * BLOCK_SIZE;
            let end = (start + BLOCK_SIZE).min(bytes.len());
            if let Some(block) = view
                .snapshot
                .get_with_options(
                    view.keys.block(&object.id, index)?,
                    &ReadOptions {
                        cache_blocks: false,
                        ..Default::default()
                    },
                )
                .await
                .map_err(failed)?
            {
                let len = block.len().min(end - start);
                bytes[start..start + len].copy_from_slice(&block[..len]);
            }
        }
    }
    let text = match String::from_utf8(bytes) {
        Ok(text) if !text.contains('\0') => text,
        _ => {
            skipped = true;
            String::new()
        }
    };
    Ok(Document {
        record,
        text,
        skipped,
    })
}

fn batch(documents: &[Document]) -> Result<RecordBatch, Status> {
    let strings = |f: fn(&Document) -> String| -> ArrayRef {
        Arc::new(StringArray::from(
            documents.iter().map(f).collect::<Vec<_>>(),
        ))
    };
    let mut keys = ListBuilder::new(StringBuilder::new());
    let mut values = ListBuilder::new(StringBuilder::new());
    for doc in documents {
        for (key, value) in &doc.record.object.xattrs {
            keys.values().append_value(label(&[key.as_bytes()]));
            values
                .values()
                .append_value(label(&[key.as_bytes(), value]));
        }
        keys.append(true);
        values.append(true);
    }
    let arrays: Vec<ArrayRef> = vec![
        strings(|d| d.record.object.id.clone()),
        Arc::new(UInt64Array::from_iter_values(
            documents.iter().map(|d| d.record.object.version),
        )),
        strings(|d| {
            d.record
                .parent
                .as_ref()
                .map_or(String::new(), |p| p.name.clone())
        }),
        strings(|d| d.record.object.mime_type.clone()),
        Arc::new(UInt64Array::from_iter_values(
            documents.iter().map(|d| d.record.object.size),
        )),
        Arc::new(Int64Array::from_iter_values(documents.iter().map(|d| {
            d.record.object.mtime.as_ref().map_or(0, |t| t.seconds)
        }))),
        Arc::new(UInt32Array::from_iter_values(
            documents
                .iter()
                .map(|d| d.record.object.mtime.as_ref().map_or(0, |t| t.nanos)),
        )),
        Arc::new(UInt32Array::from_iter_values(
            documents.iter().map(|d| d.record.object.mode),
        )),
        strings(|d| d.text.clone()),
        strings(|d| d.text.chars().take(512).collect()),
        Arc::new(BooleanArray::from(
            documents.iter().map(|d| d.skipped).collect::<Vec<_>>(),
        )),
        Arc::new(keys.finish()),
        Arc::new(values.finish()),
    ];
    RecordBatch::try_new(schema(), arrays).map_err(failed)
}

pub(super) async fn commit(
    table: &Table,
    documents: &[Document],
    deleted: &[String],
) -> Result<(), Status> {
    if !deleted.is_empty() {
        table
            .delete(
                &col("object_id")
                    .in_list(deleted.iter().map(|id| lit(id.clone())).collect(), false),
            )
            .await
            .map_err(failed)?;
    }
    if !documents.is_empty() {
        let batch = batch(documents)?;
        let reader = RecordBatchIterator::new(vec![Ok(batch)], schema());
        let mut merge = table.merge_insert(&["object_id"]);
        merge
            .when_matched_update_all(None)
            .when_not_matched_insert_all();
        merge.execute(Box::new(reader)).await.map_err(failed)?;
    }
    Ok(())
}

pub(super) async fn indexes(table: &Table) -> Result<(), Status> {
    let existing = table.list_indices().await.map_err(failed)?;
    for (column, index) in [
        (
            "text",
            Index::FTS(
                FtsIndexBuilder::default()
                    .stem(false)
                    .remove_stop_words(false),
            ),
        ),
        ("object_id", Index::BTree(Default::default())),
        ("size", Index::BTree(Default::default())),
        ("mtime_seconds", Index::BTree(Default::default())),
        ("mime_type", Index::Bitmap(Default::default())),
        ("xattr_keys", Index::LabelList(Default::default())),
        ("xattr_values", Index::LabelList(Default::default())),
    ] {
        if !existing.iter().any(|i| i.columns == [column]) {
            table
                .create_index(&[column], index)
                .execute()
                .await
                .map_err(failed)?;
        }
    }
    Ok(())
}
