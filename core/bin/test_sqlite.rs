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
    // Read the JSON file
    let data = std::fs::read_to_string("dblp.json").unwrap();
    let json: Value = serde_json::from_str(&data).unwrap();

    // Ensure the JSON value is an array
    let json_objects = json.as_array().expect("JSON value is not an array");

    // Infer schema
    let mut schema = HashMap::new();
    for object in json_objects {
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

    // Open a SQLite in-memory database
    let mut conn = Connection::open_in_memory()?;

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

    // Start a transaction
    let tx = conn.transaction()?;

    // Prepare SQL insert statement
    let keys = schema.keys().collect::<Vec<_>>();
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

    let mut stmt = tx.prepare(&insert_query)?;

    // Insert rows
    for object in json_objects {
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
        stmt.execute(params_from_iter(values.iter().collect::<Vec<_>>()))?;
    }

    stmt.finalize()?;

    // Commit the transaction
    tx.commit()?;

    // Query and print result
    let count_articles: i64 = conn.query_row(
        "SELECT COUNT(*) FROM data WHERE type = ?",
        params!["Article"],
        |row| row.get(0),
    )?;
    println!("Number of articles: {}", count_articles);

    let count_total: i64 =
        conn.query_row("SELECT COUNT(*) FROM data", params![], |row| row.get(0))?;
    println!("Total number of entries: {}", count_total);

    Ok(())
}
