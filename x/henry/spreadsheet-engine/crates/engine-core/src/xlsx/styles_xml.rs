//! `xl/styles.xml` + `xl/theme/theme1.xml`: resolve `cellXfs` into the flat,
//! color-resolved style table. Cells reference styles by xf index, which is the
//! interned style table by construction.

use quick_xml::events::Event;

use crate::error::{EngineError, Result};
use crate::numfmt::builtin_format;
use crate::style::{
    Alignment, Argb, Border, BorderSide, Fill, Font, ResolvedStyle, StyleTable, ThemePalette,
    INDEXED_PALETTE,
};

/// A color spec as written in styles.xml, before resolution.
#[derive(Debug, Clone, Copy, Default)]
struct RawColor {
    rgb: Option<Argb>,
    indexed: Option<u32>,
    theme: Option<u32>,
    tint: f64,
    auto: bool,
}

impl RawColor {
    fn from_attrs(e: &quick_xml::events::BytesStart) -> RawColor {
        let mut c = RawColor::default();
        for attr in e.attributes().flatten() {
            let value = attr.unescape_value().unwrap_or_default();
            match attr.key.as_ref() {
                b"rgb" => c.rgb = Argb::parse_hex(&value),
                b"indexed" => c.indexed = value.parse().ok(),
                b"theme" => c.theme = value.parse().ok(),
                b"tint" => c.tint = value.parse().unwrap_or(0.0),
                b"auto" => c.auto = value == "1" || value == "true",
                _ => {}
            }
        }
        c
    }

    fn resolve(&self, theme: &ThemePalette) -> Option<Argb> {
        if let Some(rgb) = self.rgb {
            return Some(rgb.with_tint(self.tint));
        }
        if let Some(idx) = self.indexed {
            return INDEXED_PALETTE.get(idx as usize).map(|&v| Argb(v));
        }
        if let Some(t) = self.theme {
            return theme
                .colors_by_index
                .get(&t)
                .map(|c| c.with_tint(self.tint));
        }
        if self.auto {
            return Some(Argb(0xFF000000));
        }
        None
    }
}

#[derive(Debug, Default)]
struct RawFont {
    bold: bool,
    italic: bool,
    underline: bool,
    strikethrough: bool,
    color: RawColor,
    has_color: bool,
    size_pt: Option<f64>,
    name: Option<String>,
}

#[derive(Debug, Default)]
struct RawFill {
    pattern: String,
    fg: Option<RawColor>,
    bg: Option<RawColor>,
}

#[derive(Debug, Default)]
struct RawBorderSide {
    style: Option<String>,
    color: Option<RawColor>,
}

#[derive(Debug, Default)]
struct RawBorder {
    top: RawBorderSide,
    right: RawBorderSide,
    bottom: RawBorderSide,
    left: RawBorderSide,
}

struct RawXf {
    num_fmt_id: u32,
    font_id: u32,
    fill_id: u32,
    border_id: u32,
    alignment: Alignment,
}

/// Parse `theme1.xml` into a resolved palette with the Excel 0<->1, 2<->3 swaps.
pub fn parse_theme(xml: &[u8]) -> Result<ThemePalette> {
    let mut reader = quick_xml::Reader::from_reader(xml);
    reader.config_mut().expand_empty_elements = true;
    let mut buf = Vec::new();

    // clrScheme document order.
    const SCHEME_ORDER: [&str; 12] = [
        "dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5",
        "accent6", "hlink", "folHlink",
    ];
    let mut scheme: Vec<Option<Argb>> = vec![None; 12];
    let mut current_slot: Option<usize> = None;
    let mut in_clr_scheme = false;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                let local = e.local_name().as_ref().to_vec();
                let name = String::from_utf8_lossy(&local).into_owned();
                if name == "clrScheme" {
                    in_clr_scheme = true;
                } else if in_clr_scheme {
                    if let Some(pos) = SCHEME_ORDER.iter().position(|&s| s == name) {
                        current_slot = Some(pos);
                    } else if name == "srgbClr" {
                        if let Some(slot) = current_slot {
                            for attr in e.attributes().flatten() {
                                if attr.key.as_ref() == b"val" {
                                    let v = attr.unescape_value().unwrap_or_default();
                                    if scheme[slot].is_none() {
                                        scheme[slot] = Argb::parse_hex(&v);
                                    }
                                }
                            }
                        }
                    } else if name == "sysClr" {
                        if let Some(slot) = current_slot {
                            for attr in e.attributes().flatten() {
                                if attr.key.as_ref() == b"lastClr" {
                                    let v = attr.unescape_value().unwrap_or_default();
                                    if scheme[slot].is_none() {
                                        scheme[slot] = Argb::parse_hex(&v);
                                    }
                                }
                            }
                        }
                    }
                }
            }
            Ok(Event::End(e)) => {
                let local = e.local_name().as_ref().to_vec();
                let name = String::from_utf8_lossy(&local).into_owned();
                if name == "clrScheme" {
                    break;
                }
                if SCHEME_ORDER.contains(&name.as_str()) {
                    current_slot = None;
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(EngineError::Corrupt(format!("bad theme1.xml: {e}"))),
            _ => {}
        }
        buf.clear();
    }

    // Theme color *index* order applies the Excel swaps: 0=lt1, 1=dk1, 2=lt2, 3=dk2.
    let index_order = [1usize, 0, 3, 2, 4, 5, 6, 7, 8, 9, 10, 11];
    let mut palette = ThemePalette::default();
    for (theme_index, &scheme_slot) in index_order.iter().enumerate() {
        if let Some(color) = scheme[scheme_slot] {
            palette.colors_by_index.insert(theme_index as u32, color);
        }
    }
    Ok(palette)
}

pub fn parse_styles(xml: &[u8], theme: ThemePalette) -> Result<StyleTable> {
    let mut reader = quick_xml::Reader::from_reader(xml);
    reader.config_mut().expand_empty_elements = true;
    let mut buf = Vec::new();

    let mut custom_numfmts: Vec<(u32, String)> = Vec::new();
    let mut fonts: Vec<RawFont> = Vec::new();
    let mut fills: Vec<RawFill> = Vec::new();
    let mut borders: Vec<RawBorder> = Vec::new();
    let mut xfs: Vec<RawXf> = Vec::new();

    #[derive(PartialEq)]
    enum Ctx {
        None,
        Fonts,
        Fills,
        Borders,
        CellXfs,
    }
    let mut ctx = Ctx::None;
    let mut border_side: Option<u8> = None; // 0=left 1=right 2=top 3=bottom

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                match e.local_name().as_ref() {
                    b"fonts" => ctx = Ctx::Fonts,
                    b"fills" => ctx = Ctx::Fills,
                    b"borders" => ctx = Ctx::Borders,
                    b"cellXfs" => ctx = Ctx::CellXfs,
                    b"numFmt" => {
                        let mut id = None;
                        let mut code = None;
                        for attr in e.attributes().flatten() {
                            let value = attr.unescape_value().unwrap_or_default().into_owned();
                            match attr.key.as_ref() {
                                b"numFmtId" => id = value.parse::<u32>().ok(),
                                b"formatCode" => code = Some(value),
                                _ => {}
                            }
                        }
                        if let (Some(id), Some(code)) = (id, code) {
                            custom_numfmts.push((id, code));
                        }
                    }
                    b"font" if ctx == Ctx::Fonts => fonts.push(RawFont::default()),
                    b"b" if ctx == Ctx::Fonts => set_font_flag(&mut fonts, &e, |f, v| f.bold = v),
                    b"i" if ctx == Ctx::Fonts => set_font_flag(&mut fonts, &e, |f, v| f.italic = v),
                    b"u" if ctx == Ctx::Fonts => {
                        // <u/> defaults to single; val="none" disables.
                        let mut on = true;
                        for attr in e.attributes().flatten() {
                            if attr.key.as_ref() == b"val" {
                                on = attr.unescape_value().unwrap_or_default() != "none";
                            }
                        }
                        if let Some(f) = fonts.last_mut() {
                            f.underline = on;
                        }
                    }
                    b"strike" if ctx == Ctx::Fonts => {
                        set_font_flag(&mut fonts, &e, |f, v| f.strikethrough = v)
                    }
                    b"sz" if ctx == Ctx::Fonts => {
                        if let Some(f) = fonts.last_mut() {
                            for attr in e.attributes().flatten() {
                                if attr.key.as_ref() == b"val" {
                                    f.size_pt =
                                        attr.unescape_value().unwrap_or_default().parse().ok();
                                }
                            }
                        }
                    }
                    b"name" if ctx == Ctx::Fonts => {
                        if let Some(f) = fonts.last_mut() {
                            for attr in e.attributes().flatten() {
                                if attr.key.as_ref() == b"val" {
                                    f.name = Some(
                                        attr.unescape_value().unwrap_or_default().into_owned(),
                                    );
                                }
                            }
                        }
                    }
                    b"color" => match ctx {
                        Ctx::Fonts => {
                            if let Some(f) = fonts.last_mut() {
                                f.color = RawColor::from_attrs(&e);
                                f.has_color = true;
                            }
                        }
                        Ctx::Borders => {
                            if let (Some(b), Some(side)) = (borders.last_mut(), border_side) {
                                let target = match side {
                                    0 => &mut b.left,
                                    1 => &mut b.right,
                                    2 => &mut b.top,
                                    _ => &mut b.bottom,
                                };
                                target.color = Some(RawColor::from_attrs(&e));
                            }
                        }
                        _ => {}
                    },
                    b"fill" if ctx == Ctx::Fills => fills.push(RawFill::default()),
                    b"patternFill" if ctx == Ctx::Fills => {
                        if let Some(f) = fills.last_mut() {
                            for attr in e.attributes().flatten() {
                                if attr.key.as_ref() == b"patternType" {
                                    f.pattern =
                                        attr.unescape_value().unwrap_or_default().into_owned();
                                }
                            }
                        }
                    }
                    b"fgColor" if ctx == Ctx::Fills => {
                        if let Some(f) = fills.last_mut() {
                            f.fg = Some(RawColor::from_attrs(&e));
                        }
                    }
                    b"bgColor" if ctx == Ctx::Fills => {
                        if let Some(f) = fills.last_mut() {
                            f.bg = Some(RawColor::from_attrs(&e));
                        }
                    }
                    b"border" if ctx == Ctx::Borders => borders.push(RawBorder::default()),
                    b"left" | b"right" | b"top" | b"bottom" if ctx == Ctx::Borders => {
                        let side = match e.local_name().as_ref() {
                            b"left" => 0,
                            b"right" => 1,
                            b"top" => 2,
                            _ => 3,
                        };
                        border_side = Some(side);
                        let mut style = None;
                        for attr in e.attributes().flatten() {
                            if attr.key.as_ref() == b"style" {
                                style =
                                    Some(attr.unescape_value().unwrap_or_default().into_owned());
                            }
                        }
                        if let Some(b) = borders.last_mut() {
                            let target = match side {
                                0 => &mut b.left,
                                1 => &mut b.right,
                                2 => &mut b.top,
                                _ => &mut b.bottom,
                            };
                            target.style = style;
                        }
                    }
                    b"xf" if ctx == Ctx::CellXfs => {
                        let mut xf = RawXf {
                            num_fmt_id: 0,
                            font_id: 0,
                            fill_id: 0,
                            border_id: 0,
                            alignment: Alignment::default(),
                        };
                        for attr in e.attributes().flatten() {
                            let value = attr.unescape_value().unwrap_or_default();
                            match attr.key.as_ref() {
                                b"numFmtId" => xf.num_fmt_id = value.parse().unwrap_or(0),
                                b"fontId" => xf.font_id = value.parse().unwrap_or(0),
                                b"fillId" => xf.fill_id = value.parse().unwrap_or(0),
                                b"borderId" => xf.border_id = value.parse().unwrap_or(0),
                                _ => {}
                            }
                        }
                        xfs.push(xf);
                    }
                    b"alignment" if ctx == Ctx::CellXfs => {
                        if let Some(xf) = xfs.last_mut() {
                            for attr in e.attributes().flatten() {
                                let value = attr.unescape_value().unwrap_or_default().into_owned();
                                match attr.key.as_ref() {
                                    b"horizontal" => xf.alignment.horizontal = Some(value),
                                    b"vertical" => xf.alignment.vertical = Some(value),
                                    b"wrapText" => {
                                        xf.alignment.wrap_text = value == "1" || value == "true"
                                    }
                                    _ => {}
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::End(e)) => match e.local_name().as_ref() {
                b"fonts" | b"fills" | b"borders" | b"cellXfs" => ctx = Ctx::None,
                b"left" | b"right" | b"top" | b"bottom" => border_side = None,
                _ => {}
            },
            Ok(Event::Eof) => break,
            Err(e) => return Err(EngineError::Corrupt(format!("bad styles.xml: {e}"))),
            _ => {}
        }
        buf.clear();
    }

    // numFmtId -> format code: custom table first, then builtins.
    let lookup_numfmt = |id: u32| -> String {
        if let Some((_, code)) = custom_numfmts.iter().find(|(cid, _)| *cid == id) {
            return code.clone();
        }
        builtin_format(id).unwrap_or("General").to_string()
    };

    let resolve_font = |id: u32| -> Font {
        let Some(raw) = fonts.get(id as usize) else {
            return Font::default();
        };
        Font {
            bold: raw.bold,
            italic: raw.italic,
            underline: raw.underline,
            strikethrough: raw.strikethrough,
            color: if raw.has_color {
                raw.color.resolve(&theme)
            } else {
                None
            },
            size_pt: raw.size_pt,
            name: raw.name.clone(),
        }
    };

    let resolve_fill = |id: u32| -> Option<Fill> {
        let raw = fills.get(id as usize)?;
        if raw.pattern.is_empty() || raw.pattern == "none" {
            return None;
        }
        Some(Fill {
            pattern: raw.pattern.clone(),
            foreground: raw.fg.and_then(|c| c.resolve(&theme)),
            background: raw.bg.and_then(|c| c.resolve(&theme)),
        })
    };

    let resolve_side = |raw: &RawBorderSide| -> Option<BorderSide> {
        let style = raw.style.clone()?;
        if style == "none" {
            return None;
        }
        Some(BorderSide {
            style,
            color: raw.color.and_then(|c| c.resolve(&theme)),
        })
    };

    let resolve_border = |id: u32| -> Border {
        let Some(raw) = borders.get(id as usize) else {
            return Border::default();
        };
        Border {
            top: resolve_side(&raw.top),
            right: resolve_side(&raw.right),
            bottom: resolve_side(&raw.bottom),
            left: resolve_side(&raw.left),
        }
    };

    let mut styles: Vec<ResolvedStyle> = xfs
        .iter()
        .map(|xf| ResolvedStyle {
            num_fmt: lookup_numfmt(xf.num_fmt_id),
            font: resolve_font(xf.font_id),
            fill: resolve_fill(xf.fill_id),
            border: resolve_border(xf.border_id),
            alignment: xf.alignment.clone(),
        })
        .collect();
    if styles.is_empty() {
        styles.push(ResolvedStyle::default());
    }

    Ok(StyleTable::new(styles, theme))
}

fn set_font_flag(
    fonts: &mut [RawFont],
    e: &quick_xml::events::BytesStart,
    set: impl Fn(&mut RawFont, bool),
) {
    let mut on = true;
    for attr in e.attributes().flatten() {
        if attr.key.as_ref() == b"val" {
            let v = attr.unescape_value().unwrap_or_default();
            on = !(v == "0" || v == "false");
        }
    }
    if let Some(f) = fonts.last_mut() {
        set(f, on);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const STYLES: &[u8] = br#"<?xml version="1.0"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1"><numFmt numFmtId="164" formatCode="0.000"/></numFmts>
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><i/><u/><strike/><sz val="14"/><color rgb="FFFF0000"/><name val="Arial"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF00B050"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FF000000"/></left><right/><top style="medium"><color rgb="FF0000FF"/></top><bottom/><diagonal/></border>
  </borders>
  <cellXfs count="3">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
    <xf numFmtId="164" fontId="1" fillId="2" borderId="1"><alignment horizontal="center" vertical="top" wrapText="1"/></xf>
    <xf numFmtId="14" fontId="0" fillId="0" borderId="0"/>
  </cellXfs>
</styleSheet>"#;

    #[test]
    fn resolves_cellxfs() {
        let table = parse_styles(STYLES, ThemePalette::default()).unwrap();
        assert_eq!(table.styles.len(), 3);
        assert_eq!(table.num_fmt(0), "General");
        assert_eq!(table.num_fmt(1), "0.000");
        assert_eq!(table.num_fmt(2), "m/d/yy", "builtin id 14");

        let s1 = table.get(1);
        assert!(s1.font.bold && s1.font.italic && s1.font.underline && s1.font.strikethrough);
        assert_eq!(s1.font.size_pt, Some(14.0));
        assert_eq!(s1.font.name.as_deref(), Some("Arial"));
        assert_eq!(s1.font.color, Some(Argb(0xFFFF0000)));
        let fill = s1.fill.as_ref().unwrap();
        assert_eq!(fill.pattern, "solid");
        assert_eq!(fill.foreground, Some(Argb(0xFF00B050)));
        assert_eq!(s1.border.left.as_ref().unwrap().style, "thin");
        assert_eq!(
            s1.border.top.as_ref().unwrap().color,
            Some(Argb(0xFF0000FF))
        );
        assert!(
            s1.border.right.is_none(),
            "sides without style resolve to none"
        );
        assert_eq!(s1.alignment.horizontal.as_deref(), Some("center"));
        assert!(s1.alignment.wrap_text);
    }

    #[test]
    fn theme_swaps_and_tints() {
        let theme_xml = br#"<?xml version="1.0"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <a:themeElements><a:clrScheme name="Office">
    <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
    <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
    <a:dk2><a:srgbClr val="44546A"/></a:dk2>
    <a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>
    <a:accent1><a:srgbClr val="4472C4"/></a:accent1>
    <a:accent2><a:srgbClr val="ED7D31"/></a:accent2>
    <a:accent3><a:srgbClr val="A5A5A5"/></a:accent3>
    <a:accent4><a:srgbClr val="FFC000"/></a:accent4>
    <a:accent5><a:srgbClr val="5B9BD5"/></a:accent5>
    <a:accent6><a:srgbClr val="70AD47"/></a:accent6>
    <a:hlink><a:srgbClr val="0563C1"/></a:hlink>
    <a:folHlink><a:srgbClr val="954F72"/></a:folHlink>
  </a:clrScheme></a:themeElements>
</a:theme>"#;
        let theme = parse_theme(theme_xml).unwrap();
        // Index 0 = lt1 (white), 1 = dk1 (black) — the Excel swap.
        assert_eq!(theme.colors_by_index.get(&0), Some(&Argb(0xFFFFFFFF)));
        assert_eq!(theme.colors_by_index.get(&1), Some(&Argb(0xFF000000)));
        assert_eq!(
            theme.colors_by_index.get(&4),
            Some(&Argb(0xFF4472C4)),
            "accent1 at index 4"
        );
    }
}
