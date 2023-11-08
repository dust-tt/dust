use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Serialize)]
pub struct Database {
    created: u64,
    database_id: String,
    internal_id: String,
    name: String,
}

#[derive(Debug, Serialize)]
pub struct DatabaseTable {
    created: u64,
    database_id: String,
    table_id: String,
    internal_id: String,
    name: String,
    description: String,
}

#[derive(Debug, Serialize)]
pub struct DatabaseRow {
    created: u64,
    table_id: String,
    row_id: String,
    internal_id: String,
    content: Value,
}
