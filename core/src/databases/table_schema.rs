use std::collections::HashMap;

use anyhow::{anyhow, Result};

use serde::{Deserialize, Serialize};
use serde_json::Value;

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

    pub fn from_rows(rows: &Vec<&Value>) -> Result<Self> {
        let mut schema = HashMap::new();

        for (row_index, row) in rows.iter().enumerate() {
            let object = row
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

    pub fn to_sql_string(&self, table_name: &str) -> String {
        let mut create_table = format!("CREATE TABLE {} (", table_name);

        for (name, field_type) in &self.0 {
            let sql_type = match field_type {
                TableSchemaFieldType::Int => "INT",
                TableSchemaFieldType::Float => "REAL",
                TableSchemaFieldType::Text => "TEXT",
                TableSchemaFieldType::Bool => "BOOLEAN",
            };

            create_table.push_str(&format!("{} {}, ", name, sql_type));
        }

        // Remove the trailing comma and space, then close the parentheses.
        let len = create_table.len();
        create_table.truncate(len - 2);
        create_table.push_str(");");

        create_table
    }
}

#[cfg(test)]
mod tests {
    use super::*;
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
        let rows = &vec![&row_1, &row_2];

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
        let rows = &vec![&row_1, &row_2, &row_3];

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
    fn test_table_schema_to_string() -> Result<()> {
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

        let sql = schema.to_sql_string("test_table");

        println!("{}", sql);

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
}
