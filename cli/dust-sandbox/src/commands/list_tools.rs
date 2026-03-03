use crate::api::DustApiClient;

pub async fn cmd_list_tools(client: &DustApiClient, server_name: &str) -> anyhow::Result<()> {
    let resolved = client.find_server(server_name).await?;

    if resolved.server.tools.is_empty() {
        println!("No tools found on server '{server_name}'.");
        return Ok(());
    }

    for tool in &resolved.server.tools {
        println!("{}:", tool.name);
        if !tool.description.is_empty() {
            println!("  {}", tool.description);
        }
        if let Some(schema) = &tool.input_schema {
            if let Some(props) = schema.get("properties") {
                if let Some(obj) = props.as_object() {
                    let required: Vec<&str> = schema
                        .get("required")
                        .and_then(|r| r.as_array())
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|v| v.as_str())
                                .collect()
                        })
                        .unwrap_or_default();

                    for (prop_name, prop_schema) in obj {
                        let type_str = prop_schema
                            .get("type")
                            .and_then(|t| t.as_str())
                            .unwrap_or("any");
                        let req_marker = if required.contains(&prop_name.as_str()) {
                            " (required)"
                        } else {
                            ""
                        };
                        let desc = prop_schema
                            .get("description")
                            .and_then(|d| d.as_str())
                            .unwrap_or("");
                        if desc.is_empty() {
                            println!("  --{prop_name} <{type_str}>{req_marker}");
                        } else {
                            println!("  --{prop_name} <{type_str}>{req_marker}  {desc}");
                        }
                    }
                }
            }
        }
        println!();
    }

    Ok(())
}
