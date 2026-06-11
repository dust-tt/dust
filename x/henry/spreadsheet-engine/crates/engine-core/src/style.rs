//! Interned cell styles. `styles.xml` defines a finite table of cell formats
//! (`cellXfs`); cells carry a `u32` index into the resolved table. Colors are
//! resolved to ARGB at parse time (theme + tint + indexed palette), so the UI
//! never needs `theme1.xml`.

use std::collections::BTreeMap;

use serde::Serialize;

/// ARGB color, e.g. 0xFF1F4E79. Serialized as `"FF1F4E79"`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Argb(pub u32);

impl Serialize for Argb {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&format!("{:08X}", self.0))
    }
}

impl Argb {
    /// Parse `"FF00B050"` / `"00B050"` hex (with or without alpha).
    pub fn parse_hex(s: &str) -> Option<Argb> {
        let v = u32::from_str_radix(s, 16).ok()?;
        match s.len() {
            8 => Some(Argb(v)),
            6 => Some(Argb(0xFF00_0000 | v)),
            _ => None,
        }
    }

    /// Apply Excel tint using the per-channel approximation used by SheetJS and
    /// friends: negative tints darken toward black, positive lighten toward white.
    pub fn with_tint(self, tint: f64) -> Argb {
        if tint == 0.0 {
            return self;
        }
        let apply = |c: u32| -> u32 {
            let c = c as f64;
            let out = if tint < 0.0 {
                c * (1.0 + tint)
            } else {
                c + (255.0 - c) * tint
            };
            out.round().clamp(0.0, 255.0) as u32
        };
        let a = self.0 >> 24;
        let r = apply((self.0 >> 16) & 0xFF);
        let g = apply((self.0 >> 8) & 0xFF);
        let b = apply(self.0 & 0xFF);
        Argb((a << 24) | (r << 16) | (g << 8) | b)
    }
}

/// Resolved theme palette: clrScheme colors in *theme index* order, i.e. with the
/// Excel 0<->1 and 2<->3 swaps already applied (index 0 = lt1, 1 = dk1, 2 = lt2,
/// 3 = dk2, 4..9 = accent1-6, 10 = hlink, 11 = folHlink).
#[derive(Debug, Clone, Default, Serialize)]
pub struct ThemePalette {
    pub colors_by_index: BTreeMap<u32, Argb>,
}

/// Legacy indexed palette (subset; index 64/65 are system fg/bg and resolve to
/// black/white). Source: ECMA-376 §18.8.27 default palette.
pub const INDEXED_PALETTE: [u32; 66] = [
    0xFF000000, 0xFFFFFFFF, 0xFFFF0000, 0xFF00FF00, 0xFF0000FF, 0xFFFFFF00, 0xFFFF00FF, 0xFF00FFFF,
    0xFF000000, 0xFFFFFFFF, 0xFFFF0000, 0xFF00FF00, 0xFF0000FF, 0xFFFFFF00, 0xFFFF00FF, 0xFF00FFFF,
    0xFF800000, 0xFF008000, 0xFF000080, 0xFF808000, 0xFF800080, 0xFF008080, 0xFFC0C0C0, 0xFF808080,
    0xFF9999FF, 0xFF993366, 0xFFFFFFCC, 0xFFCCFFFF, 0xFF660066, 0xFFFF8080, 0xFF0066CC, 0xFFCCCCFF,
    0xFF000080, 0xFFFF00FF, 0xFFFFFF00, 0xFF00FFFF, 0xFF800080, 0xFF800000, 0xFF008080, 0xFF0000FF,
    0xFF00CCFF, 0xFFCCFFFF, 0xFFCCFFCC, 0xFFFFFF99, 0xFF99CCFF, 0xFFFF99CC, 0xFFCC99FF, 0xFFFFCC99,
    0xFF3366FF, 0xFF33CCCC, 0xFF99CC00, 0xFFFFCC00, 0xFFFF9900, 0xFFFF6600, 0xFF666699, 0xFF969696,
    0xFF003366, 0xFF339966, 0xFF003300, 0xFF333300, 0xFF993300, 0xFF993366, 0xFF333399, 0xFF333333,
    0xFF000000, 0xFFFFFFFF,
];

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct Font {
    pub bold: bool,
    pub italic: bool,
    pub underline: bool,
    pub strikethrough: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<Argb>,
    /// Point size, e.g. 11.0.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size_pt: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct Fill {
    /// `"solid"`, `"gray125"`, ... `"none"` fills are represented as `None` on the style.
    pub pattern: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub foreground: Option<Argb>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub background: Option<Argb>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct BorderSide {
    /// `"thin"`, `"medium"`, `"dashed"`, ...
    pub style: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<Argb>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct Border {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top: Option<BorderSide>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub right: Option<BorderSide>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bottom: Option<BorderSide>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub left: Option<BorderSide>,
}

impl Border {
    pub fn is_empty(&self) -> bool {
        self.top.is_none() && self.right.is_none() && self.bottom.is_none() && self.left.is_none()
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct Alignment {
    /// `"left" | "center" | "right" | "justify" | "fill" | "general"` (absent = general).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub horizontal: Option<String>,
    /// `"top" | "center" | "bottom"` (absent = bottom).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vertical: Option<String>,
    pub wrap_text: bool,
}

impl Alignment {
    pub fn is_default(&self) -> bool {
        self.horizontal.is_none() && self.vertical.is_none() && !self.wrap_text
    }
}

/// One resolved entry of the workbook style table (one per `cellXf`).
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct ResolvedStyle {
    /// ECMA-376 number format code, `"General"` when unset.
    pub num_fmt: String,
    pub font: Font,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fill: Option<Fill>,
    #[serde(skip_serializing_if = "Border::is_empty")]
    pub border: Border,
    #[serde(skip_serializing_if = "Alignment::is_default")]
    pub alignment: Alignment,
}

/// Workbook-level style table. Index 0 is always the default style.
#[derive(Debug, Clone)]
pub struct StyleTable {
    pub styles: Vec<ResolvedStyle>,
    pub theme: ThemePalette,
}

impl Default for StyleTable {
    fn default() -> Self {
        StyleTable {
            styles: vec![ResolvedStyle::default()],
            theme: ThemePalette::default(),
        }
    }
}

impl StyleTable {
    pub fn get(&self, idx: u32) -> &ResolvedStyle {
        self.styles.get(idx as usize).unwrap_or(&self.styles[0])
    }

    pub fn num_fmt(&self, idx: u32) -> &str {
        let fmt = self.get(idx).num_fmt.as_str();
        if fmt.is_empty() {
            "General"
        } else {
            fmt
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hex_parsing() {
        assert_eq!(Argb::parse_hex("FF00B050"), Some(Argb(0xFF00B050)));
        assert_eq!(Argb::parse_hex("00B050"), Some(Argb(0xFF00B050)));
        assert_eq!(Argb::parse_hex("xyz"), None);
        assert_eq!(Argb::parse_hex("FFF"), None);
    }

    #[test]
    fn tint_lightens_and_darkens() {
        let base = Argb(0xFF808080);
        assert_eq!(base.with_tint(0.0), base);
        // +1.0 -> white, -1.0 -> black; alpha preserved.
        assert_eq!(base.with_tint(1.0), Argb(0xFFFFFFFF));
        assert_eq!(base.with_tint(-1.0), Argb(0xFF000000));
        // +0.5 on 0x80 (128): 128 + 127*0.5 = 191.5 -> 192 (0xC0).
        assert_eq!(base.with_tint(0.5), Argb(0xFFC0C0C0));
    }

    #[test]
    fn style_table_defaults() {
        let table = StyleTable::default();
        assert_eq!(table.num_fmt(0), "General");
        // Out-of-range index falls back to default style.
        assert_eq!(table.get(999), &ResolvedStyle::default());
    }
}
