use std::collections::HashMap;

use anyhow::{anyhow, Result};

use rusqlite::ToSql;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::database::DatabaseRow;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TableSchemaFieldType {
    Int,
    Float,
    Text,
    Bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct TableSchema(HashMap<String, TableSchemaFieldType>);

impl TableSchema {
    pub fn empty() -> Self {
        Self(HashMap::new())
    }
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    pub fn from_rows(rows: &Vec<DatabaseRow>) -> Result<Self> {
        let mut schema = HashMap::new();

        for (row_index, row) in rows.iter().enumerate() {
            let object = row
                .content()
                .as_object()
                .ok_or_else(|| anyhow!("Row {} is not an object", row_index))?;

            for (k, v) in object {
                if v.is_null() {
                    continue;
                }

                let value_type = match v {
                    Value::Bool(_) => TableSchemaFieldType::Bool,
                    Value::Number(x) => {
                        if x.is_i64() {
                            TableSchemaFieldType::Int
                        } else {
                            TableSchemaFieldType::Float
                        }
                    }
                    Value::String(_) | Value::Object(_) | Value::Array(_) => {
                        TableSchemaFieldType::Text
                    }
                    _ => unreachable!(),
                };

                if let Some(existing_type) = schema.get(k) {
                    if existing_type != &value_type {
                        return Err(anyhow!(
                            "Field {} has conflicting types on row {}: {:?} and {:?}",
                            k,
                            row_index,
                            existing_type,
                            value_type
                        ));
                    }
                } else {
                    schema.insert(k.clone(), value_type);
                }
            }
        }

        Ok(Self(schema))
    }

    pub fn get_create_table_sql_string(&self, table_name: &str) -> String {
        format!(
            "CREATE TABLE \"{}\" ({})",
            table_name,
            self.0
                .iter()
                .map(|(name, field_type)| {
                    let sql_type = match field_type {
                        TableSchemaFieldType::Int => "INT",
                        TableSchemaFieldType::Float => "REAL",
                        TableSchemaFieldType::Text => "TEXT",
                        TableSchemaFieldType::Bool => "BOOLEAN",
                    };
                    format!("\"{}\" {}", name, sql_type)
                })
                .collect::<Vec<_>>()
                .join(", ")
        )
    }

    pub fn get_insert_row_sql_string(
        &self,
        table_name: &str,
        row_content: &Value,
    ) -> Result<(String, Vec<Box<dyn ToSql>>)> {
        let row_content_map = row_content
            .as_object()
            .ok_or_else(|| anyhow!("Row content is not an object"))?;

        let field_names: Vec<&String> = self.0.keys().collect();
        let fields = field_names
            .iter()
            .map(|name| format!("\"{}\"", name))
            .collect::<Vec<String>>()
            .join(", ");
        let placeholders = field_names
            .iter()
            .enumerate()
            .map(|(i, _)| format!("?{}", i + 1))
            .collect::<Vec<String>>()
            .join(", ");

        let params: Vec<Box<dyn ToSql>> = field_names
            .iter()
            .map(|name| match row_content_map.get(*name) {
                Some(Value::Bool(b)) => Ok(Box::new(*b) as Box<dyn ToSql>),
                Some(Value::Number(n)) => n
                    .as_i64()
                    .map(|i| Box::new(i) as Box<dyn ToSql>)
                    .or_else(|| n.as_f64().map(|f| Box::new(f) as Box<dyn ToSql>))
                    .ok_or_else(|| anyhow!("Invalid number value for field {}", name)),
                Some(Value::String(s)) => Ok(Box::new(s.clone()) as Box<dyn ToSql>),
                Some(Value::Null) | None => Ok(Box::new(rusqlite::types::Null) as Box<dyn ToSql>),
                Some(_) => Err(anyhow!("Unsupported value type for field {}", name)),
            })
            .collect::<Result<Vec<Box<dyn ToSql>>>>()?;

        let insert_row = format!(
            "INSERT INTO \"{}\" ({}) VALUES ({});",
            table_name, fields, placeholders
        );

        Ok((insert_row, params))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils;
    use rusqlite::Connection;
    use serde_json::json;

    #[test]
    fn test_table_schema_from_rows() -> Result<()> {
        let row_1 = json!({
            "field1": 1,
            "field2": 1.2,
            "field3": "text",
            "field4": true,
            "field6": ["array", "elements"],
            "field7": {"key": "value"}
        });
        let row_2 = json!({
            "field1": 2,
            "field2": 2.4,
            "field3": "more text",
            "field4": false,
            "field5": "not null anymore",
            "field6": ["more", "elements"],
            "field7": {"anotherKey": "anotherValue"}
        });
        let rows = &vec![
            DatabaseRow::new(utils::now(), Some("1".to_string()), &row_1),
            DatabaseRow::new(utils::now(), Some("2".to_string()), &row_2),
        ];

        let schema = TableSchema::from_rows(rows)?;
        let expected_map: HashMap<String, TableSchemaFieldType> = [
            ("field1", TableSchemaFieldType::Int),
            ("field2", TableSchemaFieldType::Float),
            ("field3", TableSchemaFieldType::Text),
            ("field4", TableSchemaFieldType::Bool),
            ("field5", TableSchemaFieldType::Text),
            ("field6", TableSchemaFieldType::Text),
            ("field7", TableSchemaFieldType::Text),
        ]
        .iter()
        .map(|(field_id, field_type)| (field_id.to_string(), field_type.clone()))
        .collect();

        let expected_schema = TableSchema(expected_map);

        assert_eq!(schema, expected_schema);

        Ok(())
    }

    #[test]
    fn test_table_schema_from_rows_conflicting_types() {
        let row_1 = json!({
            "field1": 1,
            "field2": 1.2,
            "field3": "text",
            "field4": true,
            "field6": ["array", "elements"],
            "field7": {"key": "value"}
        });
        let row_2 = json!({
            "field1": 2,
            "field2": 2.4,
            "field3": "more text",
            "field4": "this was a bool before",
            "field5": "not null anymore",
            "field6": ["more", "elements"],
            "field7": {"anotherKey": "anotherValue"}
        });
        let row_3 = json!({
            "field1": "now it's a text field",
        });
        let rows = &vec![
            DatabaseRow::new(utils::now(), Some("1".to_string()), &row_1),
            DatabaseRow::new(utils::now(), Some("2".to_string()), &row_2),
            DatabaseRow::new(utils::now(), Some("3".to_string()), &row_3),
        ];

        let schema = TableSchema::from_rows(rows);

        assert!(
            schema.is_err(),
            "Schema should have failed due to conflicting types."
        );
    }

    #[test]
    fn test_table_schema_from_empty_rows() {
        let rows = &vec![];

        let schema = TableSchema::from_rows(rows);

        assert!(schema.is_ok(), "Schema from empty rows should be valid.");
    }

    #[test]
    fn test_table_schema_get_create_table_sql_string() -> Result<()> {
        let schema_map: HashMap<String, TableSchemaFieldType> = [
            ("field1", TableSchemaFieldType::Int),
            ("field2", TableSchemaFieldType::Float),
            ("field3", TableSchemaFieldType::Text),
            ("field4", TableSchemaFieldType::Bool),
        ]
        .iter()
        .map(|(field_id, field_type)| (field_id.to_string(), field_type.clone()))
        .collect();

        let schema = TableSchema(schema_map);

        let sql = schema.get_create_table_sql_string("test_table");

        let conn = Connection::open_in_memory()?;
        conn.execute(&sql, [])?;

        let mut stmt = conn.prepare("PRAGMA table_info(test_table);")?;
        let rows = stmt.query_map([], |row| Ok((row.get(1)?, row.get(2)?)))?;

        let mut actual_schema: HashMap<String, String> = HashMap::new();
        for row in rows {
            let (name, ty): (String, String) = row?;
            actual_schema.insert(name, ty);
        }

        assert_eq!(actual_schema["field1"], "INT");
        assert_eq!(actual_schema["field2"], "REAL");
        assert_eq!(actual_schema["field3"], "TEXT");
        assert_eq!(actual_schema["field4"], "BOOLEAN");

        Ok(())
    }

    #[test]
    fn test_get_insert_row_sql_string_success() -> Result<()> {
        let schema = create_test_schema()?;
        let conn = setup_in_memory_db(&schema)?;

        let row_content = json!({
            "field1": 1,
            "field2": 2.4,
            "field3": "text",
            "field4": true
        });

        let (sql_string, boxed_params) =
            schema.get_insert_row_sql_string("test_table", &row_content)?;

        let params_refs: Vec<&dyn ToSql> = boxed_params
            .iter()
            .map(|param| &**param as &dyn ToSql)
            .collect();

        conn.execute(&sql_string, params_refs.as_slice())?;

        let mut stmt = conn.prepare("SELECT * FROM test_table;")?;
        let mut rows = stmt.query([])?;

        if let Some(row) = rows.next()? {
            let field1: i64 = row.get("field1")?;
            let field2: f64 = row.get("field2")?;
            let field3: String = row.get("field3")?;
            let field4: bool = row.get("field4")?;

            assert_eq!(field1, 1);
            assert_eq!(field2, 2.4);
            assert_eq!(field3, "text");
            assert_eq!(field4, true);
        } else {
            return Err(anyhow!("No rows found after insert"));
        }

        Ok(())
    }

    #[test]
    fn test_get_insert_row_sql_string_missing_fields() -> Result<()> {
        let schema = create_test_schema()?;
        let conn = setup_in_memory_db(&schema)?;

        let row_content = json!({
            "field1": 1,
            "field2": 2.4
            // Missing field3 and field4
        });

        let (sql_string, boxed_params) =
            schema.get_insert_row_sql_string("test_table", &row_content)?;
        let params_refs: Vec<&dyn ToSql> = boxed_params
            .iter()
            .map(|param| &**param as &dyn ToSql)
            .collect();

        conn.execute(&sql_string, params_refs.as_slice())?;

        let mut stmt = conn.prepare("SELECT * FROM test_table;")?;
        let mut rows = stmt.query([])?;

        if let Some(row) = rows.next()? {
            let field1: i64 = row.get("field1")?;
            let field2: f64 = row.get("field2")?;
            let field3: Option<String> = row.get("field3")?;
            let field4: Option<bool> = row.get("field4")?;

            assert_eq!(field1, 1);
            assert_eq!(field2, 2.4);
            assert_eq!(field3, None);
            assert_eq!(field4, None);
        } else {
            return Err(anyhow!("No rows found after insert"));
        }

        Ok(())
    }

    // Helper function to create a test schema
    fn create_test_schema() -> Result<TableSchema> {
        let schema_map: HashMap<String, TableSchemaFieldType> = [
            ("field1", TableSchemaFieldType::Int),
            ("field2", TableSchemaFieldType::Float),
            ("field3", TableSchemaFieldType::Text),
            ("field4", TableSchemaFieldType::Bool),
        ]
        .iter()
        .cloned()
        .map(|(field_id, field_type)| (field_id.to_string(), field_type))
        .collect();

        Ok(TableSchema(schema_map))
    }

    // Helper function to set up an in-memory database with a test table
    fn setup_in_memory_db(schema: &TableSchema) -> Result<Connection> {
        let conn = Connection::open_in_memory()?;
        let sql_create_table = schema.get_create_table_sql_string("test_table");
        conn.execute(&sql_create_table, [])?;
        Ok(conn)
    }
}
