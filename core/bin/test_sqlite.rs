use dust::utils;
use rayon::prelude::*;
use rusqlite::{params, params_from_iter, types::ToSqlOutput, Connection, Result, ToSql};
use serde_json::Value;
use std::collections::HashMap;

enum SchemaFieldType {
    Int(i64),
    Text(String),
    Bool(bool),
    Null,
}

impl ToSql for SchemaFieldType {
    fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
        match self {
            SchemaFieldType::Int(i) => i.to_sql(),
            SchemaFieldType::Text(s) => s.to_sql(),
            SchemaFieldType::Bool(b) => b.to_sql(),
            SchemaFieldType::Null => Ok(ToSqlOutput::Owned(rusqlite::types::Value::Null)),
        }
    }
}

fn main() -> Result<()> {
    let now = utils::now();

    // Read the JSON file
    let data = std::fs::read_to_string("dblp.json").unwrap();

    println!("File reading: {} ms", utils::now() - now);
    let now = utils::now();

    let data = data
        .par_split('\n')
        .filter(|line| !line.is_empty())
        .map(|line| serde_json::from_str::<Value>(line).unwrap())
        .collect::<Vec<_>>();

    println!("JSON parsing: {} ms", utils::now() - now);
    let now = utils::now();

    // Infer schema
    let mut schema = HashMap::new();
    for object in &data {
        let object = object.as_object().expect("Array element is not an object");
        for (key, value) in object {
            let value_type = match value {
                Value::Number(_) => "INTEGER",
                Value::String(_) => "TEXT",
                Value::Bool(_) => "INTEGER",
                Value::Object(_) | Value::Array(_) => "TEXT",
                _ => panic!("Unsupported value type"),
            };
            if let Some(existing_type) = schema.get(key) {
                if *existing_type != value_type {
                    panic!("Incompatible value types for key {}", key);
                }
            } else {
                schema.insert(key.to_string(), value_type);
            }
        }
    }

    println!("Schema inference: {} ms", utils::now() - now);
    let now = utils::now();

    // Open a SQLite in-memory database
    let conn = Connection::open_in_memory()?;

    // Create table
    let create_table_sql = format!(
        "CREATE TABLE data ({});",
        schema
            .iter()
            .map(|(key, value_type)| format!("{} {}", key, value_type))
            .collect::<Vec<_>>()
            .join(", ")
    );
    conn.execute(&create_table_sql, params![])?;

    println!("Table creation: {} ms", utils::now() - now);
    let now = utils::now();

    let keys = schema.keys().collect::<Vec<_>>();

    // Prepare rows
    let rows = data
        .par_iter()
        .map(|object| {
            let object = object.as_object().unwrap();
            let mut values: Vec<SchemaFieldType> = Vec::new();
            for key in &keys {
                let value = match object.get(*key) {
                    Some(Value::Number(n)) => SchemaFieldType::Int(n.as_i64().unwrap()),
                    Some(Value::String(s)) => SchemaFieldType::Text(s.clone()),
                    Some(Value::Bool(b)) => SchemaFieldType::Bool(*b),
                    Some(Value::Object(_)) | Some(Value::Array(_)) => {
                        SchemaFieldType::Text(object[*key].to_string())
                    }
                    _ => SchemaFieldType::Null,
                };
                values.push(value);
            }
            values
        })
        .collect::<Vec<_>>();

    println!("Rows preparation: {} ms", utils::now() - now);
    let now = utils::now();

    // Start a transaction
    // let tx = conn.transaction()?;

    // Prepare SQL insert statement
    let insert_query = format!(
        "INSERT INTO data ({}) VALUES ({})",
        keys.iter()
            .map(|k| k.to_string())
            .collect::<Vec<_>>()
            .join(", "),
        keys.iter()
            .map(|_| "?".to_string())
            .collect::<Vec<_>>()
            .join(", ")
    );

    // Insert rows
    let mut stmt = conn.prepare(&insert_query)?;
    rows.into_iter()
        .map(|values| stmt.execute(params_from_iter(values)))
        .collect::<Result<Vec<_>>>()?;
    stmt.finalize()?;

    // Commit the transaction
    // tx.commit()?;

    println!("Insertions: {} ms", utils::now() - now);
    let now = utils::now();

    // Query and print result
    let count_articles: i64 = conn.query_row(
        "SELECT COUNT(*) FROM data WHERE type = ?",
        params!["Article"],
        |row| row.get(0),
    )?;
    println!("Number of articles: {}", count_articles);

    println!("Querying: {} ms", utils::now() - now);
    let now = utils::now();

    let count_total: i64 =
        conn.query_row("SELECT COUNT(*) FROM data", params![], |row| row.get(0))?;
    println!("Total number of entries: {}", count_total);

    println!("Querying: {} ms", utils::now() - now);

    Ok(())
}
