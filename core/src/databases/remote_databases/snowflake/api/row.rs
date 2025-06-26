use std::{collections::HashMap, sync::Arc};

use chrono::{DateTime, Days, NaiveDate, NaiveDateTime, NaiveTime, TimeDelta};

use super::error::{Error, Result};

#[derive(Debug)]
pub struct SnowflakeColumn {
    pub name: String,
    pub index: usize,
    pub column_type: SnowflakeColumnType,
}

impl SnowflakeColumn {
    pub fn name(&self) -> &str {
        &self.name
    }
    pub fn column_type(&self) -> &SnowflakeColumnType {
        &self.column_type
    }

    pub fn index(&self) -> usize {
        self.index
    }
}

#[derive(Debug, Clone)]
pub struct SnowflakeColumnType {
    pub snowflake_type: String,
    pub nullable: bool,
    pub length: Option<i64>,
    pub precision: Option<i64>,
    pub scale: Option<i64>,
}

impl SnowflakeColumnType {
    pub fn snowflake_type(&self) -> &str {
        &self.snowflake_type
    }
    pub fn nullable(&self) -> bool {
        self.nullable
    }
    pub fn length(&self) -> Option<i64> {
        self.length
    }
    pub fn precision(&self) -> Option<i64> {
        self.precision
    }
    pub fn scale(&self) -> Option<i64> {
        self.scale
    }
}

#[derive(Debug)]
pub struct SnowflakeRow {
    pub row: Vec<Option<String>>,
    pub column_types: Arc<Vec<SnowflakeColumnType>>,
    pub column_indices: Arc<HashMap<String, usize>>,
}

impl SnowflakeRow {
    pub fn get<T: SnowflakeDecode>(&self, column_name: &str) -> Result<T> {
        let idx = self
            .column_indices
            .get(&column_name.to_ascii_uppercase())
            .ok_or_else(|| Error::Decode(format!("column not found: {}", column_name)))?;
        let ty = &self.column_types[*idx];
        (&self.row[*idx], ty).try_get()
    }
    pub fn at<T: SnowflakeDecode>(&self, column_index: usize) -> Result<T> {
        let ty = &self.column_types[column_index];
        (&self.row[column_index], ty).try_get()
    }
    pub fn column_names(&self) -> Vec<&str> {
        let mut names: Vec<(_, usize)> = self.column_indices.iter().map(|(k, v)| (k, *v)).collect();
        names.sort_by_key(|(_, v)| *v);
        names.into_iter().map(|(name, _)| name.as_str()).collect()
    }
    pub fn column_types(&self) -> Vec<SnowflakeColumn> {
        let mut names: Vec<(String, usize)> = self
            .column_indices
            .iter()
            .map(|(k, v)| (k.clone(), *v))
            .collect();
        names.sort_by_key(|(_, v)| *v);
        names
            .into_iter()
            .map(|(name, index)| SnowflakeColumn {
                name,
                index,
                column_type: self.column_types[index].clone(),
            })
            .collect()
    }
}

pub trait SnowflakeDecode: Sized {
    fn try_decode(value: &Option<String>, ty: &SnowflakeColumnType) -> Result<Self>;
}

impl SnowflakeDecode for u64 {
    fn try_decode(value: &Option<String>, _: &SnowflakeColumnType) -> Result<Self> {
        let value = unwrap(value)?;
        value
            .parse()
            .map_err(|_| Error::Decode(format!("'{value}' is not u64")))
    }
}
impl SnowflakeDecode for i64 {
    fn try_decode(value: &Option<String>, _: &SnowflakeColumnType) -> Result<Self> {
        let value = unwrap(value)?;
        value
            .parse()
            .map_err(|_| Error::Decode(format!("'{value}' is not i64")))
    }
}
impl SnowflakeDecode for i32 {
    fn try_decode(value: &Option<String>, _: &SnowflakeColumnType) -> Result<Self> {
        let value = unwrap(value)?;
        value
            .parse()
            .map_err(|_| Error::Decode(format!("'{value}' is not i32")))
    }
}

impl SnowflakeDecode for f64 {
    fn try_decode(value: &Option<String>, _: &SnowflakeColumnType) -> Result<Self> {
        let value = unwrap(value)?;
        value
            .parse()
            .map_err(|_| Error::Decode(format!("'{value}' is not f64")))
    }
}

impl SnowflakeDecode for i8 {
    fn try_decode(value: &Option<String>, _: &SnowflakeColumnType) -> Result<Self> {
        let value = unwrap(value)?;
        value
            .parse()
            .map_err(|_| Error::Decode(format!("'{value}' is not i8")))
    }
}

impl SnowflakeDecode for String {
    fn try_decode(value: &Option<String>, _: &SnowflakeColumnType) -> Result<Self> {
        let value = unwrap(value)?;
        Ok(value.to_string())
    }
}

impl SnowflakeDecode for bool {
    fn try_decode(value: &Option<String>, _: &SnowflakeColumnType) -> Result<Self> {
        let value = unwrap(value)?;
        match value.to_uppercase().as_str() {
            "1" | "TRUE" => Ok(true),
            "0" | "FALSE" => Ok(false),
            _ => Err(Error::Decode(format!("'{value}' is not bool"))),
        }
    }
}

impl SnowflakeDecode for NaiveDateTime {
    fn try_decode(value: &Option<String>, ty: &SnowflakeColumnType) -> Result<Self> {
        let value = unwrap(value)?;
        let scale = ty.scale.unwrap_or(9);
        match ty.snowflake_type().to_ascii_uppercase().as_str() {
            "TIMESTAMP_LTZ" | "TIMESTAMP_NTZ" => parse_timestamp_ntz_ltz(value, scale),
            "TIMESTAMP_TZ" => parse_timestamp_tz(value, scale),
            _ => Err(Error::Decode(format!(
                "Could not decode '{value}' as timestamp, found type {}",
                ty.snowflake_type()
            ))),
        }
    }
}

fn parse_timestamp_tz(s: &str, scale: i64) -> Result<NaiveDateTime> {
    // First, we expect the string to be as the Result version 0,
    // where timezone is baked into the value.
    // Ref: https://github.com/snowflakedb/snowflake-connector-nodejs/blob/5b7dcace7b7e994eb1323b4cc2f134d7549a5c54/lib/connection/result/column.js#L378
    if let Ok(v) = s.parse::<f64>() {
        let scale_factor = 10i32.pow(scale as u32);
        let frac_secs_with_tz = v * scale_factor as f64;
        let frac_secs = frac_secs_with_tz / 16384.;
        let mut min_addend = frac_secs_with_tz as i64 % 16384;
        if min_addend < 0 {
            min_addend += 16384;
        }

        let secs = frac_secs.trunc() as i64 / scale_factor as i64;
        let nsec = (frac_secs.fract() * 10_f64.powi(9 - scale as i32)) as u32;
        let dt = DateTime::from_timestamp(secs, nsec)
            .ok_or_else(|| Error::Decode(format!("Could not decode timestamp: {}", s)))?;
        let dt = dt.naive_utc();
        return dt
            .checked_add_signed(TimeDelta::minutes(min_addend))
            .ok_or_else(|| Error::Decode(format!("Could not decode timestamp_tz: {}", s)));
    }
    // Assume the value is encoded as the other format (i.e. result version > 0)
    // once we cannot parse the string as a single float.
    let pair: Vec<_> = s.split_whitespace().collect();
    let v = pair
        .first()
        .ok_or_else(|| Error::Decode(format!("invalid timestamp_tz: {}", s)))?;
    let mut v = v
        .parse::<f64>()
        .map_err(|_| Error::Decode(format!("invalid timestamp_tz: {}", s)))?;
    let scale_factor = 10i32.pow(scale as u32);
    v *= scale_factor as f64;
    let secs = v.trunc() as i64 / scale_factor as i64;
    let nsec = (v.fract() * 10_f64.powi(9 - scale as i32)) as u32;
    let dt = DateTime::from_timestamp(secs, nsec)
        .ok_or_else(|| Error::Decode(format!("Could not decode timestamp: {}", s)))?;
    let dt = dt.naive_utc();

    let tz = pair
        .get(1)
        .ok_or_else(|| Error::Decode(format!("invalid timezone for timestamp_tz: {}", s)))?;
    let tz = tz
        .parse::<i64>()
        .map_err(|_| Error::Decode(format!("invalid timestamp_tz: {}", s)))?;
    if !(0..=2880).contains(&tz) {
        return Err(Error::Decode(format!(
            "invalid timezone for timestamp_tz: {}",
            s
        )));
    }
    // subtract 24 hours from the timezone to map [0, 48] to [-24, 24]
    let min_addend = 1440 - tz;
    dt.checked_add_signed(TimeDelta::minutes(min_addend))
        .ok_or_else(|| Error::Decode(format!("Could not decode timestamp_tz: {}", s)))
}

fn parse_timestamp_ntz_ltz(s: &str, scale: i64) -> Result<NaiveDateTime> {
    let scale_factor = 10i32.pow(scale as u32);
    if let Ok(mut v) = s.parse::<f64>() {
        v *= scale_factor as f64;
        let secs = v.trunc() as i64 / scale_factor as i64;
        let nsec = (v.fract() * 10_f64.powi(9 - scale as i32)) as u32;
        let dt = DateTime::from_timestamp(secs, nsec)
            .ok_or_else(|| Error::Decode(format!("Could not decode timestamp: {}", s)))?;
        return Ok(dt.naive_utc());
    }
    Err(Error::Decode(format!("Could not decode timestamp: {}", s)))
}

impl SnowflakeDecode for NaiveTime {
    fn try_decode(value: &Option<String>, ty: &SnowflakeColumnType) -> Result<Self> {
        let value = unwrap(value)?;
        let scale = ty.scale.unwrap_or(0);
        let scale_factor = 10i32.pow(scale as u32);
        if let Ok(mut v) = value.parse::<f64>() {
            v *= scale_factor as f64;
            let secs = (v.trunc() / scale_factor as f64) as u32;
            let nsec = (v.fract() * 10_f64.powi(9 - scale as i32)) as u32;
            let t = NaiveTime::from_num_seconds_from_midnight_opt(secs, nsec)
                .ok_or_else(|| Error::Decode(format!("invalid time: {}", value)))?;
            return Ok(t);
        }
        Err(Error::Decode(format!("'{value}' is not Time type")))
    }
}

impl SnowflakeDecode for NaiveDate {
    fn try_decode(value: &Option<String>, _: &SnowflakeColumnType) -> Result<Self> {
        let value = unwrap(value)?;
        let days_since_epoch = value
            .parse::<i64>()
            .map_err(|_| Error::Decode(format!("'{value}' is not Date type")))?;
        let unix_epoch = NaiveDate::from_ymd_opt(1970, 1, 1).unwrap_or_default();
        if days_since_epoch >= 0 {
            unix_epoch
                .checked_add_days(Days::new(days_since_epoch as u64))
                .ok_or(Error::Decode(format!("'{value}' is not a valid date")))
        } else {
            let d = days_since_epoch.unsigned_abs();
            unix_epoch
                .checked_sub_days(Days::new(d))
                .ok_or(Error::Decode(format!("'{value}' is not a valid date")))
        }
    }
}

impl SnowflakeDecode for serde_json::Value {
    fn try_decode(value: &Option<String>, _: &SnowflakeColumnType) -> Result<Self> {
        let value = unwrap(value)?;
        serde_json::from_str(value).map_err(|_| Error::Decode(format!("'{value}' is not json")))
    }
}

impl<T: SnowflakeDecode> SnowflakeDecode for Option<T> {
    fn try_decode(value: &Option<String>, ty: &SnowflakeColumnType) -> Result<Self> {
        if value.is_none() {
            return Ok(None);
        }
        T::try_decode(value, ty).map(|v| Some(v))
    }
}

trait TryGet {
    fn try_get<T: SnowflakeDecode>(&self) -> Result<T>;
}

impl TryGet for (&Option<String>, &SnowflakeColumnType) {
    fn try_get<T: SnowflakeDecode>(&self) -> Result<T> {
        T::try_decode(self.0, self.1)
    }
}

fn unwrap(value: &Option<String>) -> Result<&String> {
    value
        .as_ref()
        .ok_or_else(|| Error::Decode("value is null".into()))
}
