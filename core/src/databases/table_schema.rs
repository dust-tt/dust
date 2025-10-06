use anyhow::{anyhow, Result};
use chrono::prelude::DateTime;
use itertools::Itertools;
use rusqlite::{types::ToSqlOutput, ToSql};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
};
use tracing::warn;

use crate::databases::{database::HasValue, table::Row};

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TableSchemaFieldType {
    Int,
    Float,
    Text,
    Bool,
    DateTime,
    Reference(String),
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum SqlParam {
    Int(i64),
    Float(f64),
    Text(String),
    Bool(bool),
    Null,
}

impl ToSql for SqlParam {
    fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
        match self {
            SqlParam::Int(i) => i.to_sql(),
            SqlParam::Float(f) => f.to_sql(),
            SqlParam::Text(s) => s.to_sql(),
            SqlParam::Bool(b) => match b {
                true => 1.to_sql(),
                false => 0.to_sql(),
            },
            SqlParam::Null => Ok(ToSqlOutput::Owned(rusqlite::types::Value::Null)),
        }
    }
}

// This is used for display and DBML rendering.
impl std::fmt::Display for TableSchemaFieldType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TableSchemaFieldType::Int => write!(f, "integer"),
            TableSchemaFieldType::Float => write!(f, "real"),
            TableSchemaFieldType::Text => write!(f, "text"),
            TableSchemaFieldType::Bool => write!(f, "boolean"),
            TableSchemaFieldType::DateTime => write!(f, "timestamp"),
            TableSchemaFieldType::Reference(rel_name) => write!(f, "reference: {}", rel_name),
        }
    }
}

pub static TABLE_SCHEMA_POSSIBLE_VALUES_MAX_LEN: usize = 32;
pub static TABLE_SCHEMA_POSSIBLE_VALUES_MAX_COUNT: usize = 16;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct TableSchemaColumn {
    pub name: String,
    pub value_type: TableSchemaFieldType,
    pub possible_values: Option<Vec<String>>,
    // Set to true if this field can't be used in a where clause. False by default
    pub non_filterable: Option<bool>,
    pub description: Option<String>,
}

impl TableSchemaColumn {
    pub fn new(
        name: &str,
        field_type: TableSchemaFieldType,
        non_filterable: Option<bool>,
        description: Option<String>,
    ) -> Self {
        Self {
            name: name.to_string(),
            value_type: field_type,
            possible_values: None,
            non_filterable,
            description,
        }
    }

    pub fn render_dbml(&self, use_description: bool) -> String {
        let mut dbml = format!("{} {}", self.name, self.value_type);
        if let Some(possible_values) = &self.possible_values {
            if !possible_values.is_empty() {
                dbml.push_str(" [note: 'possible values: ");
                dbml.push_str(&possible_values.join(", "));
                dbml.push_str("']");
            }
        }

        if self.non_filterable.unwrap_or(false) {
            dbml.push_str(" [note: non filterable - this field cannot be used in a where clause]");
        }

        if use_description {
            if let Some(description) = &self.description {
                dbml.push_str(&format!(" [Description: '{}']", description));
            }
        }

        dbml
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct TableSchema(Vec<TableSchemaColumn>);

impl TableSchema {
    pub fn from_columns(columns: Vec<TableSchemaColumn>) -> Self {
        Self(columns)
    }

    pub fn empty() -> Self {
        Self(vec![])
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    pub fn columns(&self) -> &Vec<TableSchemaColumn> {
        &self.0
    }

    fn accumulate_value(column: &mut TableSchemaColumn, v: &Value) -> () {
        // If possible_values is set we attempt to update it, otherwise that means we gave up on it
        // by setting it to null so we just return.
        if let Some(possible_values) = &mut column.possible_values {
            let s = match v {
                Value::Bool(b) => match b {
                    true => "TRUE".to_string(),
                    false => "FALSE".to_string(),
                },
                Value::Number(x) => {
                    format!("{}", x)
                }
                Value::String(s) => {
                    format!("\"{}\"", s)
                }
                Value::Object(obj) => match Self::try_parse_date_object(obj) {
                    Some(date) => date,
                    None => unreachable!(),
                },
                Value::Array(_) | Value::Null => unreachable!(),
            };

            if s.len() > TABLE_SCHEMA_POSSIBLE_VALUES_MAX_LEN {
                column.possible_values = None;
                return;
            }

            if !possible_values.contains(&s) {
                possible_values.push(s);
            }

            if possible_values.len() > TABLE_SCHEMA_POSSIBLE_VALUES_MAX_COUNT {
                column.possible_values = None;
                return;
            }
        }
    }

    pub async fn from_rows_async<T: HasValue + Send + Sync + 'static>(
        rows: Arc<Vec<T>>,
    ) -> Result<TableSchema> {
        tokio::task::spawn_blocking(move || TableSchema::from_rows(&rows)).await?
    }

    pub fn from_rows<T: HasValue>(rows: &Vec<T>) -> Result<Self> {
        // Track all column names in order and store columns in a hashmap to avoid quadratic complexity
        let mut schema_order: Vec<String> = Vec::new();
        let mut seen_column_names: HashSet<String> = HashSet::new();
        let mut schema_map: HashMap<String, TableSchemaColumn> = HashMap::new();

        for (row_index, row) in rows.iter().enumerate() {
            let (headers, values) = row.value();
            for (k, v) in headers.iter().zip(values.iter()) {
                // Track column name if we haven't seen it yet
                if !seen_column_names.contains(k.as_str()) {
                    // Since all rows come from a csv, we should never see a new column after the first row
                    if row_index > 0 {
                        warn!(k, row_index, "Encountered new column past the first row");
                    }
                    schema_order.push(k.to_string());
                    seen_column_names.insert(k.to_string());
                }

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
                    Value::String(_) => TableSchemaFieldType::Text,
                    Value::Object(obj) => match Self::try_parse_date_object(obj) {
                        Some(_) => TableSchemaFieldType::DateTime,
                        None => Err(anyhow!(
                            "Field {} is not a primitive or datetime object type on row {} \
                            (non datetime object and arrays are not supported): {:?}",
                            k,
                            row_index,
                            v
                        ))?,
                    },
                    Value::Array(_) => Err(anyhow!(
                        "Field {} is not a primitive type on row {} \
                         (nondatetime object and arrays are not supported)",
                        k,
                        row_index,
                    ))?,
                    Value::Null => unreachable!(),
                };

                match schema_map.get_mut(k.as_str()) {
                    Some(column) => {
                        if column.value_type != value_type {
                            use TableSchemaFieldType::*;
                            match (&column.value_type, &value_type) {
                                // Ints and Floats can be merged into Floats.
                                (Int, Float) | (Float, Int) => {
                                    column.value_type = Float;
                                }
                                // Otherwise we default to Text.
                                _ => {
                                    column.value_type = Text;
                                }
                            }
                        }
                        Self::accumulate_value(column, &v);
                    }
                    None => {
                        let mut column = TableSchemaColumn {
                            name: k.to_string(),
                            value_type,
                            possible_values: Some(vec![]),
                            non_filterable: None,
                            description: None,
                        };
                        Self::accumulate_value(&mut column, &v);
                        schema_map.insert(k.to_string(), column);
                    }
                }
            }
        }

        // Build final schema using schema_order, adding Text type for columns with all null values
        let schema = schema_order
            .iter()
            .map(|k| {
                schema_map.get(k).cloned().unwrap_or_else(|| {
                    // Column had all null values, use Text type (with accumulated values)
                    TableSchemaColumn {
                        name: k.to_string(),
                        value_type: TableSchemaFieldType::Text,
                        possible_values: Some(vec![]),
                        non_filterable: None,
                        description: None,
                    }
                })
            })
            .collect();

        Ok(Self(schema))
    }

    pub fn get_create_table_sql_string(&self, table_name: &str) -> String {
        format!(
            "CREATE TABLE \"{}\" ({})",
            table_name,
            self.0
                .iter()
                .map(|column| {
                    let sql_type = match column.value_type {
                        TableSchemaFieldType::Int => "INT",
                        TableSchemaFieldType::Float => "REAL",
                        TableSchemaFieldType::Text => "TEXT",
                        TableSchemaFieldType::Bool => "BOOLEAN",
                        TableSchemaFieldType::DateTime => "TEXT",
                        TableSchemaFieldType::Reference(_) => "REFERENCE",
                    };
                    format!("\"{}\" {}", column.name, sql_type)
                })
                .collect::<Vec<_>>()
                .join(", ")
        )
    }

    pub fn get_insert_sql(&self, table_name: &str) -> (String, Vec<&String>) {
        let field_names: Vec<&String> = self.0.iter().map(|c| &c.name).collect();
        (
            format!(
                "INSERT INTO \"{}\" ({}) VALUES ({});",
                table_name,
                field_names
                    .iter()
                    .map(|name| format!("\"{}\"", name))
                    .collect::<Vec<String>>()
                    .join(", "),
                field_names
                    .iter()
                    .enumerate()
                    .map(|(i, _)| format!("?{}", i + 1))
                    .collect::<Vec<String>>()
                    .join(", ")
            ),
            field_names,
        )
    }

    pub fn get_insert_params(
        &self,
        field_names: &Vec<&String>,
        row: &Row,
    ) -> Result<Vec<SqlParam>> {
        field_names
            .iter()
            .map(|col| match row.value().get(*col) {
                Some(Value::Bool(b)) => Ok(SqlParam::Bool(*b)),
                Some(Value::Number(x)) => {
                    if x.is_i64() {
                        Ok(SqlParam::Int(x.as_i64().unwrap()))
                    } else if x.is_u64() {
                        Ok(SqlParam::Int(x.as_u64().unwrap() as i64))
                    } else if x.is_f64() {
                        Ok(SqlParam::Float(x.as_f64().unwrap()))
                    } else {
                        Err(anyhow!("Number is not an i64 or f64: {}", x))
                    }
                }
                Some(Value::String(s)) => Ok(SqlParam::Text(s.clone())),
                Some(Value::Object(obj)) => match Self::try_parse_date_object(obj) {
                    Some(date) => Ok(SqlParam::Text(date)),
                    None => Err(anyhow!("Unknown object type")),
                },
                None | Some(Value::Null) => Ok(SqlParam::Null),
                _ => Err(anyhow!(
                    "Cannot convert value {:?} to SqlParam",
                    row.value()
                )),
            })
            .collect::<Result<Vec<_>>>()
    }

    pub fn merge(&self, other: &Self) -> Result<Self, anyhow::Error> {
        // Index our and other columns by name.
        let our_columns_set = self.0.iter().map(|c| &c.name).collect::<HashSet<_>>();
        let other_columns_map = other
            .0
            .iter()
            .map(|c| (&c.name, c))
            .collect::<HashMap<_, _>>();

        let merged_schema = self
            .0
            .iter()
            // Iterate over all of our columns.
            .map(|our_column| {
                let mut our_column = our_column.clone();

                // If the other schema has a column with the same name, merge it into our column.
                if let Some(other_column) = other_columns_map.get(&our_column.name) {
                    // If types are different, we need to merge them.
                    if our_column.value_type != other_column.value_type {
                        use TableSchemaFieldType::*;
                        our_column.value_type =
                            match (&our_column.value_type, &other_column.value_type) {
                                // Ints and Floats can be merged into Floats.
                                (Int, Float) | (Float, Int) => TableSchemaFieldType::Float,
                                // Otherwise we default to Text.
                                _ => Text,
                            };
                    }

                    // Concatenate the unique possible values from both columns.
                    our_column.possible_values = match our_column
                        .possible_values
                        .as_ref()
                        .unwrap_or(&vec![])
                        .iter()
                        .chain(other_column.possible_values.as_ref().unwrap_or(&vec![]))
                        .map(|v| v.to_string())
                        .unique()
                        .enumerate()
                        .map(|(i, v)| {
                            // If the total number of possible values is too large, or if any of the values are
                            // too long, then we give up on possible values.
                            // If there are no possible values, then we set it to None.
                            if v.len() > TABLE_SCHEMA_POSSIBLE_VALUES_MAX_LEN
                                || i >= TABLE_SCHEMA_POSSIBLE_VALUES_MAX_COUNT
                            {
                                None
                            } else {
                                Some(v)
                            }
                        })
                        .collect::<Option<Vec<String>>>()
                    {
                        None => None,
                        Some(possible_values) => {
                            if possible_values.is_empty() {
                                None
                            } else {
                                Some(possible_values)
                            }
                        }
                    }
                }

                Ok(our_column)
            })
            // Include all of the other columns that we don't have.
            .chain(other.0.iter().filter_map(|other_column| {
                if our_columns_set.contains(&other_column.name) {
                    // We already have this column.
                    None
                } else {
                    Some(Ok(other_column.clone()))
                }
            }))
            .collect::<Result<Vec<_>>>()?;

        Ok(TableSchema(merged_schema))
    }

    pub fn render_dbml(
        &self,
        name: &str,
        description: &str,
        use_column_description: bool,
    ) -> String {
        let mut result = format!(
            "Table {} {{\n{}",
            name,
            self.columns()
                .iter()
                .map(|c| format!("  {}", c.render_dbml(use_column_description)))
                .join("\n")
        );

        if !description.is_empty() {
            result.push_str(&format!("\n\n  Note: '{}'", description));
        }

        result.push_str("\n}");
        result
    }

    pub fn try_parse_date_object(
        maybe_date_obj: &serde_json::Map<String, Value>,
    ) -> Option<String> {
        match (maybe_date_obj.get("type"), maybe_date_obj.get("epoch")) {
            (Some(Value::String(date_type)), Some(Value::Number(epoch))) => {
                if date_type == "datetime" {
                    let epoch = match epoch.as_i64() {
                        Some(epoch) => epoch,
                        None => return None,
                    };
                    DateTime::from_timestamp(epoch / 1000, ((epoch % 1000) * 1_000_000) as u32)
                        .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
                } else {
                    None
                }
            }
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::{params_from_iter, Connection};
    use serde_json::json;
    use std::collections::HashMap;

    #[test]
    fn test_table_schema_from_rows() -> Result<()> {
        let row_1 = serde_json::Map::from_iter([
            ("field1".to_string(), json!(1)),
            ("field2".to_string(), json!(1.2)),
            ("field3".to_string(), json!("text")),
            ("field4".to_string(), json!(true)),
        ]);
        let row_2 = serde_json::Map::from_iter([
            ("field1".to_string(), json!(2)),
            ("field2".to_string(), json!(2.4)),
            (
                "field3".to_string(),
                Value::String("more text but this time long and over 32 characters".to_string()),
            ),
            ("field4".to_string(), Value::Bool(false)),
            (
                "field5".to_string(),
                Value::String("not null anymore".to_string()),
            ),
            ("field6".to_string(), json!(null)),
        ]);
        let rows = &vec![
            Row::new_from_value("1".to_string(), row_1),
            Row::new_from_value("2".to_string(), row_2),
        ];

        let schema = TableSchema::from_rows(rows)?;

        let expected_schema = TableSchema(vec![
            TableSchemaColumn {
                name: "field1".to_string(),
                value_type: TableSchemaFieldType::Int,
                possible_values: Some(vec!["1".to_string(), "2".to_string()]),
                non_filterable: None,
                description: None,
            },
            TableSchemaColumn {
                name: "field2".to_string(),
                value_type: TableSchemaFieldType::Float,
                possible_values: Some(vec!["1.2".to_string(), "2.4".to_string()]),
                non_filterable: None,
                description: None,
            },
            TableSchemaColumn {
                name: "field3".to_string(),
                value_type: TableSchemaFieldType::Text,
                possible_values: None,
                non_filterable: None,
                description: None,
            },
            TableSchemaColumn {
                name: "field4".to_string(),
                value_type: TableSchemaFieldType::Bool,
                possible_values: Some(vec!["TRUE".to_string(), "FALSE".to_string()]),
                non_filterable: None,
                description: None,
            },
            TableSchemaColumn {
                name: "field5".to_string(),
                value_type: TableSchemaFieldType::Text,
                possible_values: Some(vec!["\"not null anymore\"".to_string()]),
                non_filterable: None,
                description: None,
            },
            TableSchemaColumn {
                name: "field6".to_string(),
                value_type: TableSchemaFieldType::Text,
                possible_values: Some(vec![]),
                non_filterable: None,
                description: None,
            },
        ]);

        assert_eq!(schema, expected_schema);

        Ok(())
    }

    #[test]
    fn test_table_schema_from_invalid_rows() -> Result<()> {
        use serde_json::Map;
        let row_1: Map<String, Value> = json!({"field1": 1, "field2": 1.2, "field3": "text", "field4": true, "field6": ["array", "elements"], "field7": {"key": "value"}}).as_object().unwrap().clone();
        let row_2: Map<String, Value> = json!({"field1": 2, "field2": 2.4, "field3": "more text", "field4": false, "field5": "not null anymore", "field6": ["more", "elements"], "field7": {"anotherKey": "anotherValue"}}).as_object().unwrap().clone();
        let rows = &vec![
            Row::new_from_value("1".to_string(), row_1),
            Row::new_from_value("2".to_string(), row_2),
        ];

        match TableSchema::from_rows(rows) {
            Ok(_) => Err(anyhow!("Schema should have failed due to invalid rows.")),
            Err(_) => Ok(()),
        }
    }

    #[test]
    fn test_table_schema_from_rows_conflicting_types_merged_to_text() {
        use serde_json::Map;
        let row_1: Map<String, Value> =
            json!({"field1": 1, "field2": 1.2, "field3": "text", "field4": true})
                .as_object()
                .unwrap()
                .clone();
        let row_2: Map<String, Value> = json!({"field1": 2, "field2": 2.4, "field3": "more text", "field4": "this was a bool before", "field5": "not null anymore"}).as_object().unwrap().clone();
        let row_3: Map<String, Value> = json!({"field1": "now it's a text field"})
            .as_object()
            .unwrap()
            .clone();
        let rows = &vec![
            Row::new_from_value("1".to_string(), row_1),
            Row::new_from_value("2".to_string(), row_2),
            Row::new_from_value("3".to_string(), row_3),
        ];

        let schema = TableSchema::from_rows(rows);

        assert!(
            schema.is_ok(),
            "Schema from conflicting types should be valid."
        );
        let schema = schema.unwrap();
        println!("{:?}", schema.clone());
        assert_eq!(schema.columns().len(), 5);
        assert_eq!(schema.columns()[0].value_type, TableSchemaFieldType::Text);
        assert_eq!(schema.columns()[1].value_type, TableSchemaFieldType::Float);
        assert_eq!(schema.columns()[2].value_type, TableSchemaFieldType::Text);
        assert_eq!(schema.columns()[3].value_type, TableSchemaFieldType::Text);
        assert_eq!(schema.columns()[4].value_type, TableSchemaFieldType::Text);
    }

    #[test]
    fn test_table_schema_from_empty_rows() {
        let rows: &Vec<Row> = &vec![];
        let schema = TableSchema::from_rows(rows);
        assert!(schema.is_ok(), "Schema from empty rows should be valid.");
    }

    #[test]
    fn test_table_schema_get_create_table_sql_string() -> Result<()> {
        let schema = create_test_schema();

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
        let schema = create_test_schema();
        let conn = setup_in_memory_db(&schema)?;

        let row = Row::new_from_value(
            "row_1".to_string(),
            serde_json::Map::from_iter(
                json!({"field1": 1, "field2": 2.4, "field3": "text", "field4": true})
                    .as_object()
                    .unwrap()
                    .clone(),
            ),
        );

        let (sql, field_names) = schema.get_insert_sql("test_table");

        let params_vec = schema.get_insert_params(&field_names, &row)?;

        let mut stmt = conn.prepare(&sql)?;

        stmt.execute(params_from_iter(params_vec))?;

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
        let schema = create_test_schema();
        let conn = setup_in_memory_db(&schema)?;

        let row_content = serde_json::Map::from_iter(
            json!({"field1": 1, "field2": 2.4})
                .as_object()
                .unwrap()
                .clone(),
        );

        let (sql, field_names) = schema.get_insert_sql("test_table");
        let params = params_from_iter(schema.get_insert_params(
            &field_names,
            &Row::new_from_value("1".to_string(), row_content),
        )?);
        let mut stmt = conn.prepare(&sql)?;
        stmt.execute(params)?;

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
    fn create_test_schema() -> TableSchema {
        TableSchema(vec![
            TableSchemaColumn {
                name: "field1".to_string(),
                value_type: TableSchemaFieldType::Int,
                possible_values: None,
                non_filterable: None,
                description: None,
            },
            TableSchemaColumn {
                name: "field2".to_string(),
                value_type: TableSchemaFieldType::Float,
                possible_values: None,
                non_filterable: None,
                description: None,
            },
            TableSchemaColumn {
                name: "field3".to_string(),
                value_type: TableSchemaFieldType::Text,
                possible_values: None,
                non_filterable: None,
                description: None,
            },
            TableSchemaColumn {
                name: "field4".to_string(),
                value_type: TableSchemaFieldType::Bool,
                possible_values: None,
                non_filterable: None,
                description: None,
            },
        ])
    }

    #[test]
    fn test_merge() -> Result<()> {
        let test_cases = vec![
            // (col_schema1, col_schema2, expected_type, expected_possible_values)
            // Test float / int merge.
            (
                Some(create_test_column_with_values(
                    "float_int_merge",
                    TableSchemaFieldType::Int,
                    vec!["1", "2"],
                )),
                Some(create_test_column_with_values(
                    "float_int_merge",
                    TableSchemaFieldType::Float,
                    vec!["3.5", "4.5", "5"],
                )),
                TableSchemaFieldType::Float,
                Some(vec!["1", "2", "3.5", "4.5", "5"]),
            ),
            // Test when our_column doesn't exist.
            (
                None,
                Some(create_test_column_with_values(
                    "other_column",
                    TableSchemaFieldType::Text,
                    vec!["The value is 1234", "The value is 5678", "12"],
                )),
                TableSchemaFieldType::Text,
                Some(vec!["The value is 1234", "The value is 5678", "12"]),
            ),
            // Test when other_column doesn't exist.
            (
                Some(create_test_column_with_values(
                    "our_column",
                    TableSchemaFieldType::Float,
                    vec!["1.2", "1.3"],
                )),
                None,
                TableSchemaFieldType::Float,
                Some(vec!["1.2", "1.3"]),
            ),
            // Test without possible values.
            (
                Some(TableSchemaColumn::new(
                    "no_possible_values",
                    TableSchemaFieldType::Text,
                    None,
                    None,
                )),
                Some(TableSchemaColumn::new(
                    "no_possible_values",
                    TableSchemaFieldType::Text,
                    None,
                    None,
                )),
                TableSchemaFieldType::Text,
                None,
            ),
            // Test when only other column has possible values.
            (
                None,
                Some(create_test_column_with_values(
                    "other_column_possible_values",
                    TableSchemaFieldType::Text,
                    vec!["The value is 1234", "The value is 5678", "12"],
                )),
                TableSchemaFieldType::Text,
                Some(vec!["The value is 1234", "The value is 5678", "12"]),
            ),
            // Test when only our column has possible values.
            (
                Some(create_test_column_with_values(
                    "our_column_possible_values",
                    TableSchemaFieldType::Text,
                    vec!["The value is 1234", "The value is 5678", "12"],
                )),
                None,
                TableSchemaFieldType::Text,
                Some(vec!["The value is 1234", "The value is 5678", "12"]),
            ),
            // Test case for possible values going over max count.
            (
                Some(create_test_column_with_values(
                    "going_over_max_count",
                    TableSchemaFieldType::Int,
                    (1..=TABLE_SCHEMA_POSSIBLE_VALUES_MAX_COUNT)
                        .map(|i| i.to_string())
                        .collect::<Vec<String>>()
                        .iter()
                        .map(AsRef::as_ref)
                        .collect(),
                )),
                Some(create_test_column_with_values(
                    "going_over_max_count",
                    TableSchemaFieldType::Int,
                    vec!["that's one too many"],
                )),
                TableSchemaFieldType::Int,
                None,
            ),
            // Test case for possible values going over max length.
            (
                Some(create_test_column_with_values(
                    "going_over_max_length",
                    TableSchemaFieldType::Text,
                    vec!["hello"],
                )),
                Some(create_test_column_with_values(
                    "going_over_max_length",
                    TableSchemaFieldType::Text,
                    vec![&"a".repeat(TABLE_SCHEMA_POSSIBLE_VALUES_MAX_LEN + 1)],
                )),
                TableSchemaFieldType::Text,
                None,
            ),
        ];

        let mut schema1_columns = Vec::new();
        let mut schema2_columns = Vec::new();

        for (col1, col2, _, _) in test_cases.iter() {
            if col1.is_some() {
                schema1_columns.push(col1.clone().unwrap());
            }
            if col2.is_some() {
                schema2_columns.push(col2.clone().unwrap());
            }
        }

        let schema1 = TableSchema(schema1_columns);
        let schema2 = TableSchema(schema2_columns);

        let merged_schema = schema1.merge(&schema2)?;

        for (col_1, col_2, expected_type, expected_values) in test_cases.into_iter() {
            let field_name = col_1
                .map(|c| c.name)
                .or_else(|| col_2.map(|c| c.name))
                .unwrap();

            let column = merged_schema
                .columns()
                .iter()
                .find(|c| c.name == field_name)
                .expect(&format!("Column {} not found", field_name));

            assert_eq!(column.value_type, expected_type, "{}", field_name);
            assert_eq!(
                column.possible_values,
                expected_values.map(|vals| vals.into_iter().map(|v| v.to_string()).collect()),
                "{}",
                field_name
            );
        }

        Ok(())
    }

    #[test]
    fn test_table_schema_from_rows_with_datetime() -> Result<()> {
        use serde_json::Map;
        let row_1: Map<String, serde_json::Value> =
            json!({"created_at": {"type": "datetime", "epoch": 946684800000_i64}})
                .as_object()
                .unwrap()
                .clone(); // Corresponds to 2000-01-01 00:00:00
        let row_2: Map<String, serde_json::Value> =
            json!({"created_at": {"type": "datetime", "epoch": 946771200000_i64}})
                .as_object()
                .unwrap()
                .clone(); // Corresponds to 2000-01-02 00:00:00
        let rows = &vec![
            Row::new_from_value("1".to_string(), row_1.clone()),
            Row::new_from_value("2".to_string(), row_2.clone()),
        ];

        let schema = TableSchema::from_rows(rows)?;

        let expected_schema = TableSchema(vec![TableSchemaColumn {
            name: "created_at".to_string(),
            value_type: TableSchemaFieldType::DateTime,
            possible_values: Some(vec![
                "2000-01-01 00:00:00".to_string(),
                "2000-01-02 00:00:00".to_string(),
            ]),
            non_filterable: None,
            description: None,
        }]);

        assert_eq!(schema, expected_schema);

        let conn = setup_in_memory_db(&schema)?;

        let (sql, field_names) = schema.get_insert_sql("test_table");
        let params = params_from_iter(
            schema.get_insert_params(&field_names, &Row::new_from_value("1".to_string(), row_1))?,
        );
        let mut stmt = conn.prepare(&sql)?;
        stmt.execute(params)?;

        let (sql, field_names) = schema.get_insert_sql("test_table");
        let params = params_from_iter(
            schema.get_insert_params(&field_names, &Row::new_from_value("2".to_string(), row_2))?,
        );
        let mut stmt = conn.prepare(&sql)?;
        stmt.execute(params)?;

        let mut stmt = conn.prepare(
            "SELECT * FROM test_table where created_at > datetime('2000-01-01 00:00:00');",
        )?;
        let mut rows = stmt.query([])?;
        let row = rows.next()?.unwrap();
        let created_at: String = row.get("created_at")?;
        assert_eq!(created_at, "2000-01-02 00:00:00");
        // There should be no more rows.
        assert!(rows.next()?.is_none());

        Ok(())
    }

    // Helper function to set up an in-memory database with a test table
    fn setup_in_memory_db(schema: &TableSchema) -> Result<Connection> {
        let conn = Connection::open_in_memory()?;
        let sql_create_table = schema.get_create_table_sql_string("test_table");
        conn.execute(&sql_create_table, [])?;
        Ok(conn)
    }

    // Helper function to create a test column with possible values
    fn create_test_column_with_values(
        name: &str,
        value_type: TableSchemaFieldType,
        values: Vec<&str>,
    ) -> TableSchemaColumn {
        let possible_values = values.into_iter().map(|v| v.to_string()).collect();
        TableSchemaColumn {
            name: name.to_string(),
            value_type,
            possible_values: Some(possible_values),
            non_filterable: None,
            description: None,
        }
    }
}
