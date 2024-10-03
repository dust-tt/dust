use axum_test::TestServer;

use crate::oauth::app::create_app;
use crate::utils::APIResponse;

async fn get_server() -> TestServer {
    let app = create_app().await.unwrap();
    TestServer::new(app).unwrap()
}

#[derive(PartialEq)]
pub enum HttpMethod {
    GET,
    POST,
    DELETE,
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
    } else if method == HttpMethod::POST {
        response = server.post(&url).json(body).await;
    } else if method == HttpMethod::DELETE {
        response = server.delete(&url).json(body).await;
    } else {
        panic!("Unsupported HTTP method");
    }

    response.assert_status_not_ok();
    response.text()
}

pub async fn do_api_call(url: String, method: HttpMethod, body: &serde_json::Value) -> APIResponse {
    let server = get_server().await;
    let response;
    if method == HttpMethod::GET {
        response = server.get(&url).json(body).await;
    } else if method == HttpMethod::POST {
        response = server.post(&url).json(body).await;
    } else if method == HttpMethod::DELETE {
        response = server.delete(&url).json(body).await;
    } else {
        panic!("Unsupported HTTP method");
    }

    response.assert_status_ok();
    response.json::<APIResponse>()
}
