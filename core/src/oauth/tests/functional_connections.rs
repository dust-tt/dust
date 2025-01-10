use dust::utils;

use dust::oauth::tests::utils::{do_api_call, do_failing_api_call, HttpMethod};
use serde::Deserialize;
use serde_json::json;

#[derive(Deserialize, Debug)]
struct ConnectionExpectedResponse {
    connection_id: String,
    created: u64,
    provider: String,
    status: String,
    metadata: serde_json::Map<String, serde_json::Value>,
}

#[tokio::test]
async fn test_oauth_connexion_flow_success() {
    let create_url = "/connections".to_string();
    let create_body = json!({
        "provider": "mock",
        "metadata": {
            "use_case": "connection",
            "workspace_id": "PjlCyKnRu2",
            "user_id": "5dz5IMaoLW"
        }
    });
    let api_response = do_api_call(create_url, HttpMethod::POST, &create_body).await;

    assert_eq!(api_response.error.is_none(), true);

    let connection: ConnectionExpectedResponse = serde_json::from_value(
        api_response
            .response
            .unwrap()
            .get("connection")
            .unwrap()
            .clone(),
    )
    .unwrap();

    // check that created is within the last 2 seconds of now
    assert_eq!(
        connection.created > (utils::now() - 2000) && connection.created < utils::now(),
        true
    );

    assert_eq!(connection.connection_id.starts_with("con_"), true);
    assert_eq!(connection.connection_id.len(), 79);

    assert_eq!(connection.provider, "mock");
    assert_eq!(connection.status, "pending");
    assert_eq!(connection.metadata.get("use_case").unwrap(), "connection");
    assert_eq!(
        connection.metadata.get("workspace_id").unwrap(),
        "PjlCyKnRu2"
    );
    assert_eq!(connection.metadata.get("user_id").unwrap(), "5dz5IMaoLW");

    // Now finalize the connection

    let finalize_url = format!("/connections/{}/finalize", connection.connection_id);
    let finalize_body = json!({
        "provider": "mock",
        "code": "54079555",
        "redirect_uri": "http://localhost:3000/oauth/mock/finalize"
    });
    let finalize_api_response = do_api_call(finalize_url, HttpMethod::POST, &finalize_body).await;

    assert_eq!(finalize_api_response.error.is_none(), true);

    let finalized_connection: ConnectionExpectedResponse = serde_json::from_value(
        finalize_api_response
            .response
            .unwrap()
            .get("connection")
            .unwrap()
            .clone(),
    )
    .unwrap();

    // Check that id, provider, created as well as all metadata didn't change
    assert_eq!(finalized_connection.connection_id, connection.connection_id);
    assert_eq!(finalized_connection.provider, connection.provider);
    assert_eq!(finalized_connection.created, connection.created);
    assert_eq!(finalized_connection.metadata, connection.metadata);

    // Check that the status is now "finalized"
    assert_eq!(finalized_connection.status, "finalized");

    // Now get the access token
    let access_token_url = format!("/connections/{}/access_token", connection.connection_id);
    let access_token_body = json!({
        "provider": "mock"
    });
    let access_token_api_response =
        do_api_call(access_token_url, HttpMethod::POST, &access_token_body).await;

    // Check that the response contains the access token
    assert_eq!(access_token_api_response.error.is_none(), true);
    assert_eq!(
        access_token_api_response
            .response
            .unwrap()
            .get("access_token")
            .unwrap(),
        "mock_access_token"
    );
}

#[tokio::test]
async fn test_oauth_connexion_flow_invalid_provider() {
    let create_url = "/connections".to_string();
    let create_body = json!({
        "provider": "invalid_provider",
        "metadata": {
            "use_case": "connection",
            "workspace_id": "PjlCyKnRu2",
            "user_id": "5dz5IMaoLW"
        }
    });

    do_failing_api_call(create_url, HttpMethod::POST, &create_body).await;
}

#[tokio::test]
async fn test_oauth_connexion_flow_switching_provider() {
    let create_url = "/connections".to_string();
    let create_body = json!({
        "provider": "mock",
        "metadata": {
            "use_case": "connection",
            "workspace_id": "PjlCyKnRu2",
            "user_id": "5dz5IMaoLW"
        }
    });

    let api_response = do_api_call(create_url, HttpMethod::POST, &create_body).await;

    assert_eq!(api_response.error.is_none(), true);

    let connection: ConnectionExpectedResponse = serde_json::from_value(
        api_response
            .response
            .unwrap()
            .get("connection")
            .unwrap()
            .clone(),
    )
    .unwrap();

    // Now finalize the connection

    let finalize_url = format!("/connections/{}/finalize", connection.connection_id);
    let finalize_body = json!({
        "provider": "slack",
        "code": "54079555",
        "redirect_uri": "http://localhost:3000/oauth/mock/finalize"
    });

    do_failing_api_call(finalize_url, HttpMethod::POST, &finalize_body).await;
}
