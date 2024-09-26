use axum_test::TestServer;
use serde::Deserialize;

use crate::oauth::app::create_app;

#[derive(Deserialize, Debug)]
pub struct ExpectedApiResponse {
    pub error: Option<String>,
    pub response: serde_json::Map<String, serde_json::Value>,
}

async fn get_server() -> TestServer {
    let app = create_app().await.unwrap();
    TestServer::new(app).unwrap()
}

#[derive(PartialEq)]
pub enum HttpMethod {
    GET,
    POST,
}

pub async fn do_failing_api_call(
    url: String,
    method: HttpMethod,
    body: &serde_json::Value,
) -> String {
    let server = get_server().await;

    let response;
    if method == HttpMethod::GET {
        response = server.get(&url).json(body).await;
    } else {
        response = server.post(&url).json(body).await;
    }

    response.assert_status_not_ok();
    response.text()
}

pub async fn do_api_call(
    url: String,
    method: HttpMethod,
    body: &serde_json::Value,
) -> ExpectedApiResponse {
    let server = get_server().await;
    let response;
    if method == HttpMethod::GET {
        response = server.get(&url).json(body).await;
    } else {
        response = server.post(&url).json(body).await;
    }

    response.assert_status_ok();
    response.json::<ExpectedApiResponse>()
}
