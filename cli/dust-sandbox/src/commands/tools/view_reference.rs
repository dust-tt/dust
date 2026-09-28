use anyhow::bail;

use crate::api::MCPServerView;

/// Picks the one view a server reference resolved to. Front resolves the reference (view id, then
/// view name, then server name) and returns every view matching it; more than one means the
/// reference names several instances of a server, which must fail instead of picking one.
pub fn single_view<'a>(
    views: &'a [MCPServerView],
    reference: &str,
) -> anyhow::Result<&'a MCPServerView> {
    match views {
        [] => bail!("server '{reference}' not found"),
        [view] => Ok(view),
        _ => {
            let candidates: Vec<String> = views
                .iter()
                .map(|v| format!("{} ({})", v.display_name(), v.s_id))
                .collect();
            bail!(
                "server '{reference}' is ambiguous, it matches: {}. Pass one of these names or ids instead.",
                candidates.join(", ")
            )
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn view(s_id: &str, name: Option<&str>) -> MCPServerView {
        serde_json::from_value(serde_json::json!({
            "sId": s_id,
            "name": name,
            "server": { "name": "gmail", "tools": [] },
        }))
        .expect("valid view")
    }

    #[test]
    fn no_view_is_not_found() {
        let err = single_view(&[], "gmail").expect_err("should fail");
        assert_eq!(err.to_string(), "server 'gmail' not found");
    }

    #[test]
    fn one_view_is_selected() {
        let views = vec![view("msv_a", Some("gmail1"))];
        let selected = single_view(&views, "gmail1").expect("should select");
        assert_eq!(selected.s_id, "msv_a");
    }

    #[test]
    fn several_views_are_ambiguous() {
        let views = vec![view("msv_a", Some("gmail1")), view("msv_b", None)];
        let err = single_view(&views, "gmail").expect_err("should fail");
        assert_eq!(
            err.to_string(),
            "server 'gmail' is ambiguous, it matches: gmail1 (msv_a), gmail (msv_b). \
             Pass one of these names or ids instead."
        );
    }
}
