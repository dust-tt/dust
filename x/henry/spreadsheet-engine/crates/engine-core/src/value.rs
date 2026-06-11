//! Cell values. Kept at 16 bytes: strings live in arenas and are referenced by
//! `(offset, len)`; formulas live in a sparse side table on the sheet, so the
//! common cell pays nothing for them.

/// Reference into a string arena: `(byte offset, byte length)`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct StrRef {
    pub offset: u32,
    pub len: u32,
}

/// Excel error literals.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
pub enum ErrorCode {
    Div0,
    NA,
    Name,
    Null,
    Num,
    Ref,
    Value,
    Spill,
    Calc,
    GettingData,
}

impl ErrorCode {
    pub fn as_str(&self) -> &'static str {
        match self {
            ErrorCode::Div0 => "#DIV/0!",
            ErrorCode::NA => "#N/A",
            ErrorCode::Name => "#NAME?",
            ErrorCode::Null => "#NULL!",
            ErrorCode::Num => "#NUM!",
            ErrorCode::Ref => "#REF!",
            ErrorCode::Value => "#VALUE!",
            ErrorCode::Spill => "#SPILL!",
            ErrorCode::Calc => "#CALC!",
            ErrorCode::GettingData => "#GETTING_DATA",
        }
    }

    pub fn parse(s: &str) -> Option<ErrorCode> {
        match s {
            "#DIV/0!" => Some(ErrorCode::Div0),
            "#N/A" => Some(ErrorCode::NA),
            "#NAME?" => Some(ErrorCode::Name),
            "#NULL!" => Some(ErrorCode::Null),
            "#NUM!" => Some(ErrorCode::Num),
            "#REF!" => Some(ErrorCode::Ref),
            "#VALUE!" => Some(ErrorCode::Value),
            "#SPILL!" => Some(ErrorCode::Spill),
            "#CALC!" => Some(ErrorCode::Calc),
            "#GETTING_DATA" => Some(ErrorCode::GettingData),
            _ => None,
        }
    }
}

/// A cell value. Date-ness is not a value property: serials are plain `Number`s
/// and become dates only through their number format at render time (spec §3.4).
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum CellValue {
    Number(f64),
    /// Index into the workbook shared-string arena.
    SharedString(u32),
    /// Reference into the per-sheet inline-string arena.
    InlineString(StrRef),
    Bool(bool),
    Error(ErrorCode),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cell_value_is_small() {
        assert!(std::mem::size_of::<CellValue>() <= 16);
    }

    #[test]
    fn error_codes_round_trip() {
        for code in [
            ErrorCode::Div0,
            ErrorCode::NA,
            ErrorCode::Name,
            ErrorCode::Null,
            ErrorCode::Num,
            ErrorCode::Ref,
            ErrorCode::Value,
            ErrorCode::Spill,
            ErrorCode::Calc,
            ErrorCode::GettingData,
        ] {
            assert_eq!(ErrorCode::parse(code.as_str()), Some(code));
        }
        assert_eq!(ErrorCode::parse("#NOPE!"), None);
    }
}
