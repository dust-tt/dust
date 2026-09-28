use std::collections::HashMap;

use crate::api::{DustApiClient, MCPServerView};

pub async fn cmd_list_servers(client: &DustApiClient) -> anyhow::Result<()> {
    let views = client.list_tools(None, true).await?;

    if views.is_empty() {
        println!("No MCP servers found.");
        return Ok(());
    }

    for line in server_lines(&views) {
        println!("{line}");
    }

    Ok(())
}

/// One line per view, named the way `dsbx tools <server>` accepts it. Instances of one server
/// (e.g. `gmail1` and `gmail2`) are distinct views and each get their own line; when two views
/// still share a name, their view ids are shown since only an id can tell them apart.
fn server_lines(views: &[MCPServerView]) -> Vec<String> {
    let mut name_counts: HashMap<&str, usize> = HashMap::new();
    for view in views {
        *name_counts.entry(view.display_name()).or_insert(0) += 1;
    }

    let mut sorted: Vec<&MCPServerView> = views.iter().collect();
    sorted.sort_by(|a, b| a.display_name().cmp(b.display_name()));

    sorted
        .into_iter()
        .map(|view| {
            let name = view.display_name();
            let tool_count = view.server.tools.len();
            if matches!(name_counts.get(name), Some(count) if *count > 1) {
                format!("{name}  ({tool_count} tools, id: {})", view.s_id)
            } else {
                format!("{name}  ({tool_count} tools)")
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn view(s_id: &str, name: Option<&str>, server_name: &str) -> MCPServerView {
        serde_json::from_value(serde_json::json!({
            "sId": s_id,
            "name": name,
            "server": {
                "name": server_name,
                "tools": [{ "name": "get_messages", "description": "" }],
            },
        }))
        .expect("valid view")
    }

    #[test]
    fn lists_server_instances_by_view_name() {
        let views = vec![
            view("msv_b", Some("gmail2"), "gmail"),
            view("msv_a", Some("gmail1"), "gmail"),
            view("msv_c", None, "slack"),
        ];
        assert_eq!(
            server_lines(&views),
            vec!["gmail1  (1 tools)", "gmail2  (1 tools)", "slack  (1 tools)"]
        );
    }

    #[test]
    fn shows_ids_for_views_sharing_a_name() {
        let views = vec![view("msv_a", None, "gmail"), view("msv_b", None, "gmail")];
        assert_eq!(
            server_lines(&views),
            vec!["gmail  (1 tools, id: msv_a)", "gmail  (1 tools, id: msv_b)"]
        );
    }
}
