use std::collections::HashMap;

use crate::api::DustApiClient;

pub async fn cmd_list_servers(client: &DustApiClient) -> anyhow::Result<()> {
    let spaces = client.list_spaces().await?;

    // Collect all server views, dedup by server sId.
    let mut seen: HashMap<String, (String, usize)> = HashMap::new(); // sId -> (name, tool_count)

    for space in &spaces {
        let views = client.list_server_views(&space.s_id).await?;
        for view in views {
            seen.entry(view.server.s_id.clone()).or_insert_with(|| {
                (view.server.name.clone(), view.server.tools.len())
            });
        }
    }

    if seen.is_empty() {
        println!("No MCP servers found.");
        return Ok(());
    }

    let mut servers: Vec<_> = seen.into_values().collect();
    servers.sort_by(|a, b| a.0.cmp(&b.0));

    for (name, tool_count) in &servers {
        println!("{name}  ({tool_count} tools)");
    }

    Ok(())
}
