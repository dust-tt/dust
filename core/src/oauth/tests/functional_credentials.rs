use dust::oauth::tests::utils::{do_api_call, do_failing_api_call, HttpMethod};
use dust::utils;
use serde::Deserialize;
use serde_json::json;

#[derive(Deserialize, Debug)]
struct CredentialExpectedResponse {
    credential_id: String,
    created: u64,
    provider: Option<String>,
    metadata: Option<serde_json::Map<String, serde_json::Value>>,
    content: Option<serde_json::Map<String, serde_json::Value>>,
}

#[tokio::test]
async fn test_oauth_credentials_snowflake_flow_ok() {
    let create_url = "/credentials".to_string();
    let create_body = json!({
        "provider": "snowflake",
        "metadata": {
            "workspace_id": "PjlCyKnRu2",
            "user_id": "5dz5IMaoLW"
        },
        "content": {
            "account": "test_account",
            "warehouse": "test_warehouse",
            "username": "test_username",
            "password": "test_password",
            "role": "test_role"
        }
    });

    let api_response = do_api_call(create_url, HttpMethod::POST, &create_body).await;

    assert_eq!(api_response.error.is_none(), true);

    let credential: CredentialExpectedResponse = serde_json::from_value(
        api_response
            .response
            .unwrap()
            .get("credential")
            .unwrap()
            .clone(),
    )
    .unwrap();

    // check that created is within the last 2 seconds of now
    assert_eq!(
        credential.created > (utils::now() - 2000) && credential.created < utils::now(),
        true
    );

    assert_eq!(credential.credential_id.starts_with("cred_"), true);
    assert_eq!(credential.credential_id.len(), 80);

    // Retrieve the credential
    let get_url = format!("/credentials/{}", credential.credential_id);
    let get_body = json!({});
    let api_response = do_api_call(get_url, HttpMethod::GET, &get_body).await;
    assert_eq!(api_response.error.is_none(), true);
    let retrieved_credential: CredentialExpectedResponse = serde_json::from_value(
        api_response
            .response
            .unwrap()
            .get("credential")
            .unwrap()
            .clone(),
    )
    .unwrap();

    // Check same id, same created, same provider, same metadata, same content
    assert_eq!(retrieved_credential.credential_id, credential.credential_id);
    assert_eq!(retrieved_credential.created, credential.created);

    assert_eq!(retrieved_credential.provider.unwrap(), "snowflake");

    let metadata = retrieved_credential.metadata.unwrap();
    assert_eq!(metadata.get("user_id").unwrap(), "5dz5IMaoLW");
    assert_eq!(metadata.get("workspace_id").unwrap(), "PjlCyKnRu2");

    let content = retrieved_credential.content.unwrap();
    assert_eq!(content.get("account").unwrap(), "test_account");
    assert_eq!(content.get("warehouse").unwrap(), "test_warehouse");
    assert_eq!(content.get("username").unwrap(), "test_username");
    assert_eq!(content.get("password").unwrap(), "test_password");
    assert_eq!(content.get("role").unwrap(), "test_role");
}

#[tokio::test]
async fn test_oauth_credentials_snowflake_delete_ok() {
    let create_url = "/credentials".to_string();
    let create_body = json!({
        "provider": "snowflake",
        "metadata": {
            "workspace_id": "PjlCyKnRu2",
            "user_id": "5dz5IMaoLW"
        },
        "content": {
            "account": "test_account",
            "warehouse": "test_warehouse",
            "username": "test_username",
            "password": "test_password",
            "role": "test_role"
        }
    });

    let api_response = do_api_call(create_url, HttpMethod::POST, &create_body).await;

    assert_eq!(api_response.error.is_none(), true);

    let credential: CredentialExpectedResponse = serde_json::from_value(
        api_response
            .response
            .unwrap()
            .get("credential")
            .unwrap()
            .clone(),
    )
    .unwrap();

    // Delete the credential
    let delete_url = format!("/credentials/{}", credential.credential_id);
    let delete_body = json!({});
    let api_response = do_api_call(delete_url, HttpMethod::DELETE, &delete_body).await;
    assert_eq!(api_response.error.is_none(), true);
    assert_eq!(api_response.response.is_none(), true);

    // Retrieve the credential should 404
    let get_url = format!("/credentials/{}", credential.credential_id);
    let get_body = json!({});
    do_failing_api_call(get_url, HttpMethod::GET, &get_body).await;
}

#[tokio::test]
async fn test_oauth_credentials_bigquery_flow_ok() {
    let create_url = "/credentials".to_string();
    let create_body = json!({
        "provider": "bigquery",
        "metadata": {
            "workspace_id": "PjlCyKnRu2",
            "user_id": "5dz5IMaoLW"
        },
        "content": {
            "type": "service_account",
            "project_id": "test-project",
            "private_key_id": "test-key-id",
            "private_key": "test-private-key",
            "client_email": "test@test-project.iam.gserviceaccount.com",
            "client_id": "test-client-id",
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/test",
            "universe_domain": "googleapis.com",
            "location": "EU"
        }
    });

    let api_response = do_api_call(create_url, HttpMethod::POST, &create_body).await;

    assert_eq!(api_response.error.is_none(), true);

    let credential: CredentialExpectedResponse = serde_json::from_value(
        api_response
            .response
            .unwrap()
            .get("credential")
            .unwrap()
            .clone(),
    )
    .unwrap();

    assert_eq!(
        credential.created > (utils::now() - 2000) && credential.created < utils::now(),
        true
    );

    assert_eq!(credential.credential_id.starts_with("cred_"), true);
    assert_eq!(credential.credential_id.len(), 80);

    // Retrieve the credential
    let get_url = format!("/credentials/{}", credential.credential_id);
    let get_body = json!({});
    let api_response = do_api_call(get_url, HttpMethod::GET, &get_body).await;
    assert_eq!(api_response.error.is_none(), true);
    let retrieved_credential: CredentialExpectedResponse = serde_json::from_value(
        api_response
            .response
            .unwrap()
            .get("credential")
            .unwrap()
            .clone(),
    )
    .unwrap();

    assert_eq!(retrieved_credential.credential_id, credential.credential_id);
    assert_eq!(retrieved_credential.created, credential.created);
    assert_eq!(retrieved_credential.provider.unwrap(), "bigquery");

    let metadata = retrieved_credential.metadata.unwrap();
    assert_eq!(metadata.get("user_id").unwrap(), "5dz5IMaoLW");
    assert_eq!(metadata.get("workspace_id").unwrap(), "PjlCyKnRu2");

    let content = retrieved_credential.content.unwrap();
    assert_eq!(content.get("type").unwrap(), "service_account");
    assert_eq!(content.get("project_id").unwrap(), "test-project");
    assert_eq!(content.get("private_key_id").unwrap(), "test-key-id");
    assert_eq!(content.get("private_key").unwrap(), "test-private-key");
    assert_eq!(
        content.get("client_email").unwrap(),
        "test@test-project.iam.gserviceaccount.com"
    );
    assert_eq!(content.get("location").unwrap(), "EU");
}

#[tokio::test]
async fn test_oauth_credentials_bigquery_delete_ok() {
    let create_url = "/credentials".to_string();
    let create_body = json!({
        "provider": "bigquery",
        "metadata": {
            "workspace_id": "PjlCyKnRu2",
            "user_id": "5dz5IMaoLW"
        },
        "content": {
            "type": "service_account",
            "project_id": "test-project",
            "private_key_id": "test-key-id",
            "private_key": "test-private-key",
            "client_email": "test@test-project.iam.gserviceaccount.com",
            "client_id": "test-client-id",
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/test",
            "universe_domain": "googleapis.com",
            "location": "US"
        }
    });

    let api_response = do_api_call(create_url, HttpMethod::POST, &create_body).await;
    assert_eq!(api_response.error.is_none(), true);

    let credential: CredentialExpectedResponse = serde_json::from_value(
        api_response
            .response
            .unwrap()
            .get("credential")
            .unwrap()
            .clone(),
    )
    .unwrap();

    // Delete the credential
    let delete_url = format!("/credentials/{}", credential.credential_id);
    let delete_body = json!({});
    let api_response = do_api_call(delete_url, HttpMethod::DELETE, &delete_body).await;
    assert_eq!(api_response.error.is_none(), true);
    assert_eq!(api_response.response.is_none(), true);

    // Retrieve the credential should 404
    let get_url = format!("/credentials/{}", credential.credential_id);
    let get_body = json!({});
    do_failing_api_call(get_url, HttpMethod::GET, &get_body).await;
}

#[tokio::test]
async fn test_oauth_credentials_snowflake_invalid_content() {
    let create_url = "/credentials".to_string();
    let create_body = json!({
        "provider": "snowflake",
        "metadata": {
            "workspace_id": "PjlCyKnRu2",
            "user_id": "5dz5IMaoLW"
        },
        "content": {
            // Missing required fields and invalid field
            "invalid_field": "test",
            "account": "test_account"
        }
    });

    do_failing_api_call(create_url, HttpMethod::POST, &create_body).await;
}

#[tokio::test]
async fn test_oauth_credentials_bigquery_invalid_content() {
    let create_url = "/credentials".to_string();
    let create_body = json!({
        "provider": "bigquery",
        "metadata": {
            "workspace_id": "PjlCyKnRu2",
            "user_id": "5dz5IMaoLW"
        },
        "content": {
            // Missing required fields and invalid field
            "invalid_field": "test",
            "project_id": "test-project"
        }
    });

    do_failing_api_call(create_url, HttpMethod::POST, &create_body).await;
}
