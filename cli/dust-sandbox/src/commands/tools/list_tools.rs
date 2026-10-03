use serde_json::Value;

use super::view_reference::single_view;
use crate::api::DustApiClient;

const INDENT_STEP: usize = 2;

pub async fn cmd_list_tools(client: &DustApiClient, server_name: &str) -> anyhow::Result<()> {
    let views = client.list_tools(Some(server_name), false).await?;
    let view = single_view(&views, server_name)?;

    if view.server.tools.is_empty() {
        println!("No tools found on server '{server_name}'.");
        return Ok(());
    }

    for tool in &view.server.tools {
        println!("{}:", tool.name);
        if !tool.description.is_empty() {
            println!("  {}", tool.description);
        }
        if let Some(schema) = &tool.input_schema {
            for line in render_input_schema(schema) {
                println!("{line}");
            }
        }
        println!();
    }

    Ok(())
}

/**
 * @cc [owner:davidebbo,label:product] nested-schema-rendering
 * Top-level properties MUST render as `--name <type>` flag lines. Every property nested under
 * them (object `properties`, array `items`, `additionalProperties` maps, and each non-null
 * `anyOf`/`oneOf`/`allOf` variant) MUST render recursively, indented under its parent, so that
 * the listing describes the full `--args-json` shape. `$ref`s MUST be resolved as JSON pointers
 * against the root schema; a `$ref` already being expanded on the current path MUST be labeled
 * recursive instead of expanded again, so cyclic schemas terminate.
 */
fn render_input_schema(schema: &Value) -> Vec<String> {
    let renderer = SchemaRenderer { root: schema };
    let mut lines = Vec::new();
    if let Deref::Schema(schema, visiting) = renderer.deref(schema, &[]) {
        renderer.push_properties(schema, &visiting, 1, "--", &mut lines);
    }
    lines
}

enum Deref<'a> {
    Schema(&'a Value, Vec<&'a str>),
    Recursive(&'a str),
    Unresolved(&'a str),
}

struct SchemaRenderer<'a> {
    root: &'a Value,
}

impl<'a> SchemaRenderer<'a> {
    /// Follows `$ref` chains to the referenced schema. `visiting` holds the refs expanded on the
    /// current path; the returned list extends it with the refs followed here.
    fn deref(&self, schema: &'a Value, visiting: &[&'a str]) -> Deref<'a> {
        let mut schema = schema;
        let mut visiting = visiting.to_vec();
        while let Some(reference) = schema.get("$ref").and_then(Value::as_str) {
            if visiting.contains(&reference) {
                return Deref::Recursive(reference);
            }
            visiting.push(reference);
            match reference
                .strip_prefix('#')
                .and_then(|pointer| self.root.pointer(pointer))
            {
                Some(target) => schema = target,
                None => return Deref::Unresolved(reference),
            }
        }
        Deref::Schema(schema, visiting)
    }

    /// One-line type summary, e.g. `string`, `array<object>`, `"asc"|"desc"`, `string|null`.
    fn label(&self, schema: &'a Value, visiting: &[&'a str]) -> String {
        let (schema, visiting) = match self.deref(schema, visiting) {
            Deref::Schema(schema, visiting) => (schema, visiting),
            Deref::Recursive(reference) => return format!("recursive {reference}"),
            Deref::Unresolved(reference) => return reference.to_string(),
        };
        if let Some(value) = schema.get("const") {
            return value.to_string();
        }
        if let Some(values) = schema.get("enum").and_then(Value::as_array) {
            return join(values.iter().map(Value::to_string), "|");
        }
        match schema.get("type") {
            Some(Value::String(ty)) => self.typed_label(ty, schema, &visiting),
            Some(Value::Array(types)) => join(
                types
                    .iter()
                    .filter_map(Value::as_str)
                    .map(|ty| self.typed_label(ty, schema, &visiting)),
                "|",
            ),
            _ => match composition(schema) {
                Some((separator, variants)) => join(
                    variants
                        .iter()
                        .map(|variant| self.label(variant, &visiting)),
                    separator,
                ),
                None => "any".to_string(),
            },
        }
    }

    fn typed_label(&self, ty: &str, schema: &'a Value, visiting: &[&'a str]) -> String {
        match ty {
            "array" => match schema.get("items").filter(|items| items.is_object()) {
                Some(items) => format!("array<{}>", self.label(items, visiting)),
                None => "array".to_string(),
            },
            "object" if schema.get("properties").is_none() => match map_values(schema) {
                Some(values) => format!("map<string, {}>", self.label(values, visiting)),
                None => "object".to_string(),
            },
            _ => ty.to_string(),
        }
    }

    /// Pushes one line per property of `schema`, each followed by its own nested lines.
    fn push_properties(
        &self,
        schema: &'a Value,
        visiting: &[&'a str],
        depth: usize,
        prefix: &str,
        lines: &mut Vec<String>,
    ) {
        let Some(properties) = schema.get("properties").and_then(Value::as_object) else {
            return;
        };
        let required: Vec<&str> = schema
            .get("required")
            .and_then(Value::as_array)
            .map(|names| names.iter().filter_map(Value::as_str).collect())
            .unwrap_or_default();

        for (name, property) in properties {
            let mut line = format!(
                "{}{prefix}{name} <{}>",
                indent(depth),
                self.label(property, visiting)
            );
            if required.contains(&name.as_str()) {
                line.push_str(" (required)");
            }
            if let Some(default) = property.get("default") {
                line.push_str(&format!(" (default: {default})"));
            }
            let description = property
                .get("description")
                .and_then(Value::as_str)
                .unwrap_or("");
            if !description.is_empty() {
                line.push_str(&format!("  {description}"));
            }
            lines.push(line);
            self.push_children(property, visiting, depth + 1, lines);
        }
    }

    /// Pushes the lines describing what is nested inside `schema`, if anything.
    fn push_children(
        &self,
        schema: &'a Value,
        visiting: &[&'a str],
        depth: usize,
        lines: &mut Vec<String>,
    ) {
        let Deref::Schema(schema, visiting) = self.deref(schema, visiting) else {
            return;
        };

        self.push_properties(schema, &visiting, depth, "", lines);
        if let Some(items) = schema.get("items").filter(|items| items.is_object()) {
            self.push_children(items, &visiting, depth, lines);
        }
        if schema.get("properties").is_none() {
            if let Some(values) = map_values(schema) {
                self.push_children(values, &visiting, depth, lines);
            }
        }

        let Some((separator, variants)) = composition(schema) else {
            return;
        };
        let variants: Vec<&Value> = variants.iter().filter(|v| !is_null_type(v)).collect();
        if let [variant] = variants.as_slice() {
            self.push_children(variant, &visiting, depth, lines);
            return;
        }
        let mut variant_lines = Vec::new();
        let mut has_nested = false;
        for variant in variants {
            variant_lines.push(format!(
                "{}{separator} <{}>",
                indent(depth),
                self.label(variant, &visiting)
            ));
            let before = variant_lines.len();
            self.push_children(variant, &visiting, depth + 1, &mut variant_lines);
            has_nested |= variant_lines.len() > before;
        }
        // Scalar-only unions are fully described by the parent's label.
        if has_nested {
            lines.extend(variant_lines);
        }
    }
}

/// The variants of an `anyOf`/`oneOf`/`allOf` schema, with the separator used to display them.
fn composition(schema: &Value) -> Option<(&'static str, &Vec<Value>)> {
    [("anyOf", "|"), ("oneOf", "|"), ("allOf", "&")]
        .into_iter()
        .find_map(|(keyword, separator)| {
            schema
                .get(keyword)
                .and_then(Value::as_array)
                .map(|variants| (separator, variants))
        })
}

/// The value schema of a string-keyed map (`additionalProperties: { ... }`).
fn map_values(schema: &Value) -> Option<&Value> {
    schema
        .get("additionalProperties")
        .filter(|values| values.is_object())
}

fn is_null_type(schema: &Value) -> bool {
    schema.get("type").and_then(Value::as_str) == Some("null")
}

fn indent(depth: usize) -> String {
    " ".repeat(depth * INDENT_STEP)
}

/// Joins the distinct `parts` in order: variants sharing a label (e.g. several object shapes)
/// are told apart by their nested lines, not by the label.
fn join(parts: impl Iterator<Item = String>, separator: &str) -> String {
    let mut distinct: Vec<String> = Vec::new();
    for part in parts {
        if !distinct.contains(&part) {
            distinct.push(part);
        }
    }
    distinct.join(separator)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn render(schema: Value) -> String {
        render_input_schema(&schema).join("\n")
    }

    #[test]
    fn flat_schema_keeps_flag_format() {
        let schema = json!({
            "type": "object",
            "properties": {
                "query": { "type": "string", "description": "What to search" },
                "limit": { "type": "integer", "default": 10 }
            },
            "required": ["query"]
        });
        assert_eq!(
            render(schema),
            "  --limit <integer> (default: 10)\n  --query <string> (required)  What to search"
        );
    }

    #[test]
    fn nested_objects_and_arrays_render_recursively() {
        let schema = json!({
            "type": "object",
            "properties": {
                "filter": {
                    "type": "object",
                    "properties": {
                        "tags": { "type": "array", "items": { "type": "string" } },
                        "range": {
                            "type": "object",
                            "properties": { "from": { "type": "integer" } },
                            "required": ["from"]
                        }
                    }
                },
                "rows": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": { "id": { "type": "string" } },
                        "required": ["id"]
                    }
                }
            }
        });
        assert_eq!(
            render(schema),
            [
                "  --filter <object>",
                "    range <object>",
                "      from <integer> (required)",
                "    tags <array<string>>",
                "  --rows <array<object>>",
                "    id <string> (required)",
            ]
            .join("\n")
        );
    }

    #[test]
    fn enums_type_unions_and_maps_get_descriptive_labels() {
        let schema = json!({
            "properties": {
                "sort": { "type": "string", "enum": ["asc", "desc"] },
                "kind": { "const": "page" },
                "maybe": { "type": ["string", "null"] },
                "labels": { "type": "object", "additionalProperties": { "type": "string" } },
                "free": {}
            }
        });
        assert_eq!(
            render(schema),
            [
                "  --free <any>",
                "  --kind <\"page\">",
                "  --labels <map<string, string>>",
                "  --maybe <string|null>",
                "  --sort <\"asc\"|\"desc\">",
            ]
            .join("\n")
        );
    }

    #[test]
    fn nullable_object_renders_its_properties_inline() {
        let schema = json!({
            "properties": {
                "page": {
                    "anyOf": [
                        { "type": "object", "properties": { "cursor": { "type": "string" } } },
                        { "type": "null" }
                    ]
                }
            }
        });
        assert_eq!(
            render(schema),
            "  --page <object|null>\n    cursor <string>"
        );
    }

    #[test]
    fn unions_with_object_variants_list_each_variant() {
        let schema = json!({
            "properties": {
                "target": {
                    "oneOf": [
                        {
                            "type": "object",
                            "properties": { "id": { "type": "string" } },
                            "required": ["id"]
                        },
                        { "type": "string" }
                    ]
                },
                "scalar": { "anyOf": [{ "type": "string" }, { "type": "number" }] }
            }
        });
        assert_eq!(
            render(schema),
            [
                "  --scalar <string|number>",
                "  --target <object|string>",
                "    | <object>",
                "      id <string> (required)",
                "    | <string>",
            ]
            .join("\n")
        );
    }

    #[test]
    fn variants_sharing_a_label_are_labeled_once() {
        let schema = json!({
            "properties": {
                "end": {
                    "anyOf": [
                        { "type": "object", "properties": { "dateTime": { "type": "string" } } },
                        { "type": "object", "properties": { "date": { "type": "string" } } }
                    ]
                }
            }
        });
        assert_eq!(
            render(schema),
            [
                "  --end <object>",
                "    | <object>",
                "      dateTime <string>",
                "    | <object>",
                "      date <string>",
            ]
            .join("\n")
        );
    }

    #[test]
    fn refs_resolve_against_root_including_path_refs() {
        // zod-to-json-schema reuses repeated subschemas through path refs into the root.
        let schema = json!({
            "$ref": "#/definitions/Input",
            "definitions": {
                "Input": {
                    "type": "object",
                    "properties": {
                        "a": { "$ref": "#/definitions/Point" },
                        "b": { "$ref": "#/definitions/Input/properties/a" }
                    }
                },
                "Point": {
                    "type": "object",
                    "properties": { "x": { "type": "number" } }
                }
            }
        });
        assert_eq!(
            render(schema),
            [
                "  --a <object>",
                "    x <number>",
                "  --b <object>",
                "    x <number>",
            ]
            .join("\n")
        );
    }

    #[test]
    fn recursive_refs_terminate() {
        let schema = json!({
            "properties": {
                "tree": { "$ref": "#/$defs/Node" }
            },
            "$defs": {
                "Node": {
                    "type": "object",
                    "properties": {
                        "children": { "type": "array", "items": { "$ref": "#/$defs/Node" } }
                    }
                }
            }
        });
        assert_eq!(
            render(schema),
            "  --tree <object>\n    children <array<recursive #/$defs/Node>>"
        );
    }

    #[test]
    fn unresolvable_refs_show_the_reference() {
        let schema = json!({
            "properties": { "ext": { "$ref": "https://example.com/schema.json" } }
        });
        assert_eq!(render(schema), "  --ext <https://example.com/schema.json>");
    }
}
