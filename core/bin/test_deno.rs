use anyhow::Result;
use dust::deno::script::{async_call, call, safe_async_call};
use tokio::{task, try_join};

async fn test() -> Result<()> {
    println!("here");
    let js_code = r#"
        _fun = (env) => {
            return env.state.INPUT;
        }
    "#;
    let env = serde_json::json!({ "state": { "INPUT": { "foo": "bar" } } });
    let timeout = std::time::Duration::from_secs(10);

    let r = tokio::task::spawn_blocking(move || {
        // let rt = tokio::runtime::Builder::new_current_thread()
        //     .enable_all()
        //     .thread_keep_alive(timeout)
        //     .build()
        //     .unwrap();

        call(&js_code, "_fun", &env, Some(timeout))
        // rt.block_on(async move {
        //     tokio::time::timeout(timeout, async_call(&js_code, "_fun", &env, Some(timeout))).await
        // })
    })
    .await??;

    // let r = safe_async_call(js_code, fun, &env, None).await?;

    // let local = tokio::task::LocalSet::new();
    // let r = local
    //     .run_until(async {
    //         let r = task::spawn_local(async move { async_call(js_code, fun, &env, None).await })
    //             .await?;
    //         r
    //     })
    //     .await?;
    println!("there");

    Ok(())
}

async fn mutli_test() -> Result<()> {
    try_join!(
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
        test(),
    )?;

    // let mut futures = vec![];
    // for _ in 0..32 {
    //     futures.push(test());
    // }
    // // futures::future::join_all(futures).await;
    // tokio::try_join_all(futures).await?;
    // sleep for 10s
    println!("sleeping for 10s");
    tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;
    Ok(())
}

fn main() {
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(32)
        .enable_all()
        .build()
        .unwrap();

    if let Err(error) = runtime.block_on(mutli_test()) {
        eprintln!("error: {}", error);
    }
}
