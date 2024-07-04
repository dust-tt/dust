use anyhow::Result;
use dust::deno::js_executor::{JSClient, JSExecutor};
use tokio::try_join;

// create a worker on the main thread init

async fn test(js_client: JSClient) -> Result<()> {
    println!("here");
    let js_code = r#"
        _fun = (env) => {
            return env.state.INPUT;
        }
    "#;
    let env = serde_json::json!({ "state": { "INPUT": { "foo": "bar" } } });
    let timeout = std::time::Duration::from_secs(10);

    js_client
        .exec(js_code.to_string(), "_fun".to_string(), env, timeout)
        .await?;
    println!("there");

    Ok(())
}

async fn mutli_test(js_client: JSClient) -> Result<()> {
    try_join!(
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
        test(js_client.clone()),
    )?;

    println!("sleeping for 10s");
    tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;
    Ok(())
}

fn main() {
    let (js_executor, js_client) = JSExecutor::new();
    JSExecutor::start(js_executor);

    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(32)
        .enable_all()
        .max_blocking_threads(4)
        .build()
        .unwrap();

    if let Err(error) = runtime.block_on(mutli_test(js_client)) {
        eprintln!("error: {}", error);
    }
}
