use anyhow::{anyhow, Result};
use cloud_storage::Object;
use csv_async::AsyncReaderBuilder;
use futures::stream::StreamExt;
use lazy_static::lazy_static;
use tokio::io::AsyncReadExt;

use crate::info;
use regex::Regex;
use tokio_util::compat::TokioAsyncReadCompatExt;
use unicode_normalization::UnicodeNormalization;

use crate::{
    databases::table::{CsvRow, CsvTable, Row},
    utils,
};

pub struct GoogleCloudStorageCSVContent {
    pub bucket: String,
    pub bucket_csv_path: String,
}

const MAX_TABLE_COLUMNS: usize = 512;
const MAX_COLUMN_NAME_LENGTH: usize = 1024;
const MAX_TABLE_ROWS: usize = 500_000;

impl GoogleCloudStorageCSVContent {
    pub async fn parse(&self) -> Result<Vec<Row>> {
        let table = self.parse_to_table().await?;
        Ok(table.to_rows())
    }

    pub async fn parse_to_table(&self) -> Result<CsvTable> {
        let now = utils::now();
        let bucket = &self.bucket;
        let path = &self.bucket_csv_path;

        // This is not the most efficient as we download the entire file here but we will
        // materialize it in memory as CsvTable anyway so that's not a massive difference.
        let content = Object::download(bucket, path).await?;
        let rdr = std::io::Cursor::new(content);

        // We buffer the reader to make sure we yield the thread while processing.
        const CHUNK_SIZE: usize = 64 * 1024; // 64KB chunks
        let buffered = tokio::io::BufReader::with_capacity(CHUNK_SIZE, rdr);
        let download_duration = utils::now() - now;

        let now = utils::now();
        let (delimiter, rdr) = Self::find_delimiter(buffered).await?;
        let delimiter_duration = utils::now() - now;

        let now = utils::now();
        let table = Self::csv_to_table(rdr, delimiter).await?;
        let csv_to_table_duration = utils::now() - now;

        info!(
            row_count = table.len(),
            download_duration = download_duration,
            delimiter_duration = delimiter_duration,
            csv_to_table_duration = csv_to_table_duration,
            "CSV parse to table"
        );
        Ok(table)
    }

    fn slugify(text: &str) -> String {
        lazy_static! {
            static ref DIACRITICS: Regex = Regex::new(r"[\u{0300}-\u{036f}]").unwrap();
            static ref UNDERSCORES: Regex = Regex::new(r"_+").unwrap();
            static ref WHITESPACE: Regex = Regex::new(r"\s+").unwrap();
            static ref NON_ASCII: Regex = Regex::new(r"[^a-zA-Z0-9_]").unwrap();
        }

        let s = text
            .nfkd() // Normalize to decomposed form
            .collect::<String>();
        let s = DIACRITICS.replace_all(&s, "").to_string();

        // Insert _ between lowercase and uppercase/number
        let mut with_separators = String::new();
        let chars: Vec<char> = s.chars().collect();
        for (i, &c) in chars.iter().enumerate() {
            if i > 0 && (c.is_uppercase() || c.is_ascii_digit()) {
                if chars[i - 1].is_lowercase() {
                    with_separators.push('_');
                }
            }
            with_separators.push(c);
        }

        let s = with_separators.to_lowercase().trim().to_string();
        let s = WHITESPACE.replace_all(&s, "_").to_string();
        let s = NON_ASCII.replace_all(&s, "_").to_string();

        UNDERSCORES.replace_all(&s, "_").to_string()
    }

    pub fn sanitize_headers(headers: Vec<&str>) -> Result<Vec<String>> {
        let mut acc = Vec::new();

        for curr in headers {
            // Special case for __dust_id which is a reserved header
            let slug = if curr == "__dust_id" {
                curr.to_string()
            } else {
                let s = Self::slugify(&curr.to_lowercase());
                if s.is_empty() {
                    format!("col_{}", acc.len())
                } else {
                    s
                }
            };

            if slug.len() > MAX_COLUMN_NAME_LENGTH {
                return Err(anyhow!("Column name exceeds maximum length"));
            }

            if !acc.contains(&slug) {
                acc.push(slug);
                continue;
            }

            // Handle conflicts by appending incrementing numbers
            let mut conflict_resolved = false;
            for i in 2..64 {
                let candidate = Self::slugify(&format!("{}-{}", slug, i));
                if !acc.contains(&candidate) {
                    acc.push(candidate);
                    conflict_resolved = true;
                    break;
                }
            }

            if !conflict_resolved {
                return Err(anyhow!(
                    "Failed to generate unique slugified name \
                      for header '{}' after multiple attempts",
                    curr
                ));
            }
        }

        Ok(acc)
    }

    async fn find_delimiter<R: tokio::io::AsyncRead + Unpin + Send + 'static>(
        mut rdr: R,
    ) -> Result<(u8, Box<dyn tokio::io::AsyncRead + Unpin + Send>)> {
        let mut buffer = vec![0; 16 * 1024];
        let n = rdr.read(&mut buffer).await?;
        buffer.truncate(n);

        let candidates = b",;\t";

        let mut counts = vec![0; candidates.len()];
        let mut in_quotes = false;

        for &c in &buffer {
            match c {
                b'"' => in_quotes = !in_quotes,
                _ if !in_quotes => {
                    for (i, &candidate) in candidates.iter().enumerate() {
                        if c == candidate {
                            counts[i] += 1;
                        }
                    }
                }
                _ => {}
            }
        }

        let (i, _) = counts
            .iter()
            .enumerate()
            // Negative index to prioritize earlier delimiters
            .max_by_key(|&(i, count)| (count, -(i as i32)))
            .ok_or_else(|| anyhow!("No delimiter found"))?;

        Ok((
            candidates[i],
            Box::new(tokio::io::AsyncReadExt::chain(
                std::io::Cursor::new(buffer),
                rdr,
            )),
        ))
    }

    async fn csv_to_table<R>(rdr: R, delimiter: u8) -> Result<CsvTable>
    where
        R: tokio::io::AsyncRead + Unpin + Send,
    {
        let mut csv = AsyncReaderBuilder::new()
            .delimiter(delimiter)
            .flexible(true)
            .create_reader(TokioAsyncReadCompatExt::compat(rdr));

        let headers = Self::sanitize_headers(csv.headers().await?.iter().collect::<Vec<&str>>())?;

        if headers.len() > MAX_TABLE_COLUMNS {
            Err(anyhow!("Too many columns in CSV file"))?;
        }
        if headers.len() == 0 {
            Err(anyhow!("No columns in CSV file"))?;
        }

        let mut table = CsvTable::new(headers.clone());

        let mut records = csv.records();
        let mut row_idx = 0;
        while let Some(record) = records.next().await {
            let record = record?;
            let csv_row =
                Self::csv_record_to_csv_row(&headers, record.iter().collect::<Vec<_>>(), row_idx)?;
            row_idx += 1;
            if row_idx > MAX_TABLE_ROWS {
                Err(anyhow!("Too many rows in CSV file"))?;
            }
            table.rows.push(csv_row);
        }

        Ok(table)
    }

    fn csv_record_to_csv_row(
        headers: &Vec<String>,
        record: Vec<&str>,
        row_idx: usize,
    ) -> Result<CsvRow> {
        let mut values = Vec::with_capacity(headers.len());

        fn try_parse_float(s: &str) -> Result<serde_json::Number> {
            if let Ok(float) = s.parse::<f64>() {
                match serde_json::Number::from_f64(float) {
                    Some(num) => Ok(num),
                    None => Err(anyhow!("Invalid JSON float value")),
                }
            } else {
                Err(anyhow!("Invalid float value"))
            }
        }

        for (i, header) in headers.iter().enumerate() {
            if header == "__dust_id" {
                continue;
            }

            let field = record.get(i).unwrap_or(&"");
            let trimmed = field.trim();

            let parsed_value = if trimmed.is_empty() {
                serde_json::Value::Null
            } else if let Ok(int) = trimmed.parse::<i64>() {
                serde_json::Value::Number(int.into())
            } else if let Ok(float) = try_parse_float(trimmed) {
                // Numbers
                serde_json::Value::Number(float)
            } else if let Ok(bool_val) = match trimmed.to_lowercase().as_str() {
                // Booleans
                "t" | "true" => Ok(true),
                "f" | "false" => Ok(false),
                _ => Err(anyhow!("Invalid boolean value")),
            } {
                serde_json::Value::Bool(bool_val)
            } else {
                // Various datetime formats
                let mut dt: Option<chrono::DateTime<chrono::Utc>> = [
                    // RFC3339
                    chrono::DateTime::parse_from_rfc3339(trimmed).map(|dt| dt.into()),
                    // RFC2822
                    chrono::DateTime::parse_from_rfc2822(trimmed).map(|dt| dt.into()),
                    // SQL
                    chrono::DateTime::parse_from_str(trimmed, "%Y-%m-%d %H:%M:%S")
                        .map(|dt| dt.into()),
                    // HTTP date
                    chrono::DateTime::parse_from_str(trimmed, "%a, %d %b %Y %H:%M:%S GMT")
                        .map(|dt| dt.into()),
                    // Google Spreadsheet format
                    chrono::NaiveDate::parse_from_str(trimmed, "%d-%b-%Y").map(|d| {
                        let dt = d.and_hms_opt(0, 0, 0).unwrap();
                        dt.and_local_timezone(chrono::Utc).unwrap()
                    }),
                    // Date with full month, zero-padded number, full year
                    chrono::NaiveDate::parse_from_str(trimmed, "%B %d %Y").map(|d| {
                        let dt = d.and_hms_opt(0, 0, 0).unwrap();
                        dt.and_local_timezone(chrono::Utc).unwrap()
                    }),
                ]
                .iter()
                .find_map(|result| result.ok());

                // We fallback on dateparser for all other formats
                if dt.is_none() {
                    dt = match std::panic::catch_unwind(|| {
                        dateparser::parse_with(
                            trimmed,
                            &chrono::Utc,
                            chrono::NaiveTime::from_hms_opt(0, 0, 0).unwrap(),
                        )
                    }) {
                        Ok(result) => result.ok(),
                        Err(e) => {
                            crate::warn!("Panic while parsing date '{}': {:?}", trimmed, e);
                            None
                        }
                    };
                }

                if let Some(datetime) = dt {
                    let mut dt_obj = serde_json::Map::new();
                    dt_obj.insert(
                        "type".to_string(),
                        serde_json::Value::String("datetime".to_string()),
                    );
                    dt_obj.insert(
                        "epoch".to_string(),
                        serde_json::Value::Number(serde_json::Number::from(
                            datetime.timestamp_millis(),
                        )),
                    );
                    dt_obj.insert(
                        "string_value".to_string(),
                        serde_json::Value::String(trimmed.to_string()),
                    );
                    serde_json::Value::Object(dt_obj)
                } else {
                    serde_json::Value::String(trimmed.to_string())
                }
            };

            values.push(parsed_value);
        }

        let row_id = if let Some(pos) = headers.iter().position(|h| h == "__dust_id") {
            record.get(pos).map(|id| id.trim().to_string())
        } else {
            None
        }
        .unwrap_or_else(|| row_idx.to_string());

        Ok(CsvRow {
            row_id,
            values,
            is_delete: false,
        })
    }
}

#[cfg(test)]
mod tests {
    use crate::databases::table_schema::{TableSchema, TableSchemaFieldType};

    use super::*;

    #[tokio::test]
    async fn test_find_delimiter() -> anyhow::Result<()> {
        let csv = "a,b,c\n1,2,3\n4,5,6";
        let (delimiter, _) =
            GoogleCloudStorageCSVContent::find_delimiter(std::io::Cursor::new(csv)).await?;
        assert_eq!(delimiter, b',');

        let csv = "a;b;c\n1;2;3\n4;5;6";
        let (delimiter, mut rdr) =
            GoogleCloudStorageCSVContent::find_delimiter(std::io::Cursor::new(csv)).await?;
        assert_eq!(delimiter, b';');

        // read content of rdr to a string
        let mut content = String::new();
        rdr.read_to_string(&mut content).await?;
        assert_eq!(content, csv);

        let csv = "URL,Example\n\
FOO,swap\tblocked\tstyle-src-elem\ttheme.js:2\n\
BAR,acme";
        let (delimiter, _) =
            GoogleCloudStorageCSVContent::find_delimiter(std::io::Cursor::new(csv)).await?;
        assert_eq!(delimiter, b',');

        Ok(())
    }

    #[tokio::test]
    async fn test_sanitize_headers() -> anyhow::Result<()> {
        // This test covers alignment of the slugification we were doing in front before moving
        // this logic to core. It's important to preserve it as non truncated upserts would be
        // impacted by a change of headers.
        let headers = vec![
            "helloWorld",
            "b,.,2Fkls",
            "Æúű---cool?",
            "___",
            "a",
            "c_____d__",
            "___",
            "__dust_id",
            "a",
            "",
            "a",
            "Тип задачи",
            "Примечания",
            "",
            "重要度",
            "入出荷数量(+ or -) の COU",
            "旧_Offered price per video(2024.7)",
            "🦄 IG User ID",
        ];
        let sanitized = GoogleCloudStorageCSVContent::sanitize_headers(headers)?;
        assert_eq!(
            sanitized,
            vec![
                "helloworld",
                "b_2fkls",
                "_uu_cool_",
                "_",
                "a",
                "c_d_",
                "_2",
                "__dust_id",
                "a_2",
                "col_9",
                "a_3",
                "_3",
                "_4",
                "col_13",
                "_5",
                "_or_cou",
                "_offered_price_per_video_2024_7_",
                "_ig_user_id"
            ]
        );
        Ok(())
    }

    #[tokio::test]
    async fn test_csv_to_table() -> anyhow::Result<()> {
        let csv = "hellWorld,super-fast,c/foo,DATE\n\
                   1,2.23,3,2025-02-14T15:06:52.380Z\n\
                   4,hello world,6,\"Fri, 14 Feb 2025 15:10:34 GMT\"";
        let (delimiter, rdr) =
            GoogleCloudStorageCSVContent::find_delimiter(std::io::Cursor::new(csv)).await?;
        let table = GoogleCloudStorageCSVContent::csv_to_table(rdr, delimiter).await?;

        assert_eq!(table.rows.len(), 2);
        assert_eq!(
            table.headers,
            vec!["hellworld", "super_fast", "c_foo", "date"]
        );

        // Test first row
        assert_eq!(table.rows[0].row_id, "0");
        assert_eq!(table.rows[0].values.len(), 4);
        assert_eq!(table.rows[0].values[0], serde_json::Value::Number(1.into()));
        assert_eq!(
            table.rows[0].values[1],
            serde_json::Value::Number(serde_json::Number::from_f64(2.23).unwrap())
        );
        assert_eq!(table.rows[0].values[2], serde_json::Value::Number(3.into()));

        let date = table.rows[0].values[3].as_object().unwrap();
        assert_eq!(date["type"], "datetime");
        assert_eq!(date["epoch"], 1739545612380i64);
        assert_eq!(date["string_value"], "2025-02-14T15:06:52.380Z");

        // Test second row
        assert_eq!(table.rows[1].row_id, "1");
        assert_eq!(table.rows[1].values[0], serde_json::Value::Number(4.into()));
        assert_eq!(
            table.rows[1].values[1],
            serde_json::Value::String("hello world".to_string())
        );
        assert_eq!(table.rows[1].values[2], serde_json::Value::Number(6.into()));

        let date = table.rows[1].values[3].as_object().unwrap();
        assert_eq!(date["type"], "datetime");
        assert_eq!(date["epoch"], 1739545834000i64);
        assert_eq!(date["string_value"], "Fri, 14 Feb 2025 15:10:34 GMT");

        // Test with __dust_id
        let csv = "__dust_id,super-fast,c/foo,DATE\n\
                   MYID1,2.23,3,2025-02-14T15:06:52.380Z\n\
                   MYID2,hello world,6,\"Fri, 14 Feb 2025 15:10:34 GMT\"";
        let (delimiter, rdr) =
            GoogleCloudStorageCSVContent::find_delimiter(std::io::Cursor::new(csv)).await?;
        let table = GoogleCloudStorageCSVContent::csv_to_table(rdr, delimiter).await?;

        assert_eq!(table.rows.len(), 2);
        assert_eq!(
            table.headers,
            vec!["__dust_id", "super_fast", "c_foo", "date"]
        );
        assert_eq!(table.rows[0].row_id, "MYID1");
        assert_eq!(table.rows[1].row_id, "MYID2");
        // Values should not include __dust_id
        assert_eq!(table.rows[0].values.len(), 3);
        assert_eq!(
            table.rows[0].values[0],
            serde_json::Value::Number(serde_json::Number::from_f64(2.23).unwrap())
        );

        Ok(())
    }

    #[tokio::test]
    async fn test_csv_with_dust_id() -> anyhow::Result<()> {
        let csv = "hellWorld,super-fast,__dust_id,c/foo,DATE\n\
                   1,2.23,foo0,3,2025-02-14T15:06:52.380Z\n\
                   4,hello world,foo1,6,\"Fri, 14 Feb 2025 15:10:34 GMT\"";
        let (delimiter, rdr) =
            GoogleCloudStorageCSVContent::find_delimiter(std::io::Cursor::new(csv)).await?;
        let table = GoogleCloudStorageCSVContent::csv_to_table(rdr, delimiter).await?;

        assert_eq!(table.rows.len(), 2);
        assert_eq!(
            table.headers,
            vec!["hellworld", "super_fast", "__dust_id", "c_foo", "date"]
        );

        // Test that __dust_id is used to define the row ids.
        assert_eq!(table.rows[0].row_id, "foo0");
        assert_eq!(table.rows[1].row_id, "foo1");

        // Test that __dust_id is not included in values
        assert_eq!(table.rows[0].values.len(), 4); // Only 4 values, not 5
        assert_eq!(table.rows[0].values[0], serde_json::Value::Number(1.into()));
        assert_eq!(
            table.rows[0].values[1],
            serde_json::Value::Number(serde_json::Number::from_f64(2.23).unwrap())
        );
        assert_eq!(table.rows[0].values[2], serde_json::Value::Number(3.into()));

        // Test values alignment (skipping __dust_id)
        let expected_headers_without_dust_id = vec!["hellworld", "super_fast", "c_foo", "date"];
        for (i, header) in expected_headers_without_dust_id.iter().enumerate() {
            match *header {
                "hellworld" => {
                    assert_eq!(table.rows[0].values[i], serde_json::Value::Number(1.into()))
                }
                "super_fast" => assert_eq!(
                    table.rows[0].values[i],
                    serde_json::Value::Number(serde_json::Number::from_f64(2.23).unwrap())
                ),
                "c_foo" => assert_eq!(table.rows[0].values[i], serde_json::Value::Number(3.into())),
                "date" => assert!(table.rows[0].values[i].is_object()),
                _ => panic!("Unexpected header: {}", header),
            }
        }

        Ok(())
    }

    #[tokio::test]
    async fn test_csv_errors() -> anyhow::Result<()> {
        // Test empty CSV
        let csv = "";
        let (delimiter, rdr) =
            GoogleCloudStorageCSVContent::find_delimiter(std::io::Cursor::new(csv)).await?;
        assert!(GoogleCloudStorageCSVContent::csv_to_table(rdr, delimiter)
            .await
            .is_err());

        // Test CSV with only headers
        let csv = "header1,header2";
        let (delimiter, rdr) =
            GoogleCloudStorageCSVContent::find_delimiter(std::io::Cursor::new(csv)).await?;
        let table = GoogleCloudStorageCSVContent::csv_to_table(rdr, delimiter).await?;
        assert_eq!(table.rows.len(), 0);

        // Test CSV with too many columns (if MAX_TABLE_COLUMNS is defined)
        let mut csv = String::new();
        for i in 0..1000 {
            if i > 0 {
                csv.push(',');
            }
            csv.push_str(&format!("header{}", i));
        }
        let (delimiter, rdr) =
            GoogleCloudStorageCSVContent::find_delimiter(std::io::Cursor::new(csv)).await?;
        assert!(GoogleCloudStorageCSVContent::csv_to_table(rdr, delimiter)
            .await
            .is_err());

        Ok(())
    }

    #[tokio::test]
    async fn test_csv_to_schema_end_to_end() -> anyhow::Result<()> {
        let csv = "string,int,float,bool,date\n\
                   foo,123,0.231,true,2025-02-14T15:06:52.380Z\n\
                   ,,,,\n\
                    , , , , \n\
                    , , ,TRUE , \n\
                    , , ,FALSE, \n\
                    , , ,t , \n\
                   bar,0,23123.0,false,\"Fri, 14 Feb 2025 15:10:34 GMT\"";
        let (delimiter, rdr) =
            GoogleCloudStorageCSVContent::find_delimiter(std::io::Cursor::new(csv)).await?;
        let table = GoogleCloudStorageCSVContent::csv_to_table(rdr, delimiter).await?;
        let schema = TableSchema::from_csv_table(&table)?;

        assert_eq!(schema.columns()[0].value_type, TableSchemaFieldType::Text);
        assert_eq!(schema.columns()[1].value_type, TableSchemaFieldType::Int);
        assert_eq!(schema.columns()[2].value_type, TableSchemaFieldType::Float);
        assert_eq!(schema.columns()[3].value_type, TableSchemaFieldType::Bool);
        assert_eq!(
            schema.columns()[4].value_type,
            TableSchemaFieldType::DateTime
        );

        Ok(())
    }

    #[tokio::test]
    async fn test_csv_to_table_no_header_duplication() -> anyhow::Result<()> {
        // Create a CSV with many columns
        let mut csv_content = String::new();

        // Create headers
        let num_columns = 50;
        for i in 0..num_columns {
            if i > 0 {
                csv_content.push(',');
            }
            csv_content.push_str(&format!("col_{}", i));
        }
        csv_content.push('\n');

        // Create rows
        let num_rows = 100;
        for row in 0..num_rows {
            for col in 0..num_columns {
                if col > 0 {
                    csv_content.push(',');
                }
                csv_content.push_str(&format!("{}", row * num_columns + col));
            }
            csv_content.push('\n');
        }

        let (delimiter, rdr) =
            GoogleCloudStorageCSVContent::find_delimiter(std::io::Cursor::new(csv_content.clone()))
                .await?;
        let table = GoogleCloudStorageCSVContent::csv_to_table(rdr, delimiter).await?;

        // Verify structure
        assert_eq!(table.headers.len(), num_columns);
        assert_eq!(table.rows.len(), num_rows);

        // Verify that headers are stored only once in the table
        assert_eq!(table.headers[0], "col_0");
        assert_eq!(table.headers[49], "col_49");

        // Verify that rows contain only values (no header duplication)
        assert_eq!(table.rows[0].values.len(), num_columns);
        assert_eq!(table.rows[0].values[0], serde_json::Value::Number(0.into()));
        assert_eq!(
            table.rows[99].values[49],
            serde_json::Value::Number((99 * num_columns + 49).into())
        );

        // Verify row IDs
        assert_eq!(table.rows[0].row_id, "0");
        assert_eq!(table.rows[99].row_id, "99");

        // Memory efficiency test: Headers should be a Vec<String>, not duplicated per row
        // The key insight is that headers exist only once in table.headers,
        // and rows only contain values without any header strings
        for row in &table.rows {
            assert_eq!(row.values.len(), num_columns);
            // Ensure no header strings are stored in row values
            for value in &row.values {
                match value {
                    serde_json::Value::Number(_) => {} // Expected
                    _ => panic!("Expected only numbers in values, got: {:?}", value),
                }
            }
        }

        Ok(())
    }
}
