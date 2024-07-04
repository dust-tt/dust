use std::{ops::Add, sync::mpsc, time::Duration};

use anyhow::{anyhow, Result};
use deno_core::{error::AnyError, serde_v8, v8, JsRuntime, RuntimeOptions};
use parking_lot::RwLock;
use tokio::sync::oneshot;

#[derive(serde::Serialize, serde::Deserialize, Debug)]
pub struct ValueWithLogs {
    value: serde_json::Value,
    logs: Vec<serde_json::Value>,
}

struct JSRequest {
    // the response channel is a tokio onshot since we'll be running in the tokio runtime
    // associated with the JsRuntime created on a dedicated thread.
    response_channel: oneshot::Sender<Result<ValueWithLogs, AnyError>>,
    js_code: String,
    fn_name: String,
    json_args: serde_json::Value,
    timeout: Duration,
}

#[derive(Debug, Clone)]
pub struct JSClient {
    tx: mpsc::Sender<JSRequest>,
}

impl JSClient {
    pub async fn exec<A, R>(
        &self,
        js_code: &str,
        fn_name: &str,
        arguments: A,
        timeout: Duration,
    ) -> Result<(R, Vec<serde_json::Value>)>
    where
        A: serde::Serialize,
        R: serde::de::DeserializeOwned,
    {
        let json_args = serde_json::to_value(arguments)?;

        let (tx, rx) = oneshot::channel();
        let r = JSRequest {
            response_channel: tx,
            js_code: js_code.to_string(),
            fn_name: fn_name.to_string(),
            json_args,
            timeout,
        };

        // tx.send is non-blocking since the sync::thread mpsc channel has infinite buffer.
        self.tx.send(r)?;

        // this is a tokio::sync::oneshot channel so this is a properly supported async await for
        // the tokio runtime.
        let r = rx.await??;

        Ok((
            serde_json::from_value::<R>(r.value)
                .map_err(|e| anyhow!("Deserialization error: {}", e))?,
            r.logs,
        ))
    }
}

// This is a parking_lot Mutex (so blocking) but the operation will just be a simple clone.
static JS_CLIENT: RwLock<Option<JSClient>> = RwLock::new(None);

pub struct JSExecutor {
    rx: mpsc::Receiver<JSRequest>,
}

/// JSExecutor is in charge of spawning a dedicated thread per deno runtime to execute isolated and
/// sandboxed javascript code. The JSClient is used to send requests to the JSExecutor
/// asyncrohonously from any thread or tokio worker.
/// # Example Usage
///
/// ```
/// use std::collections::HashMap;
///
/// use anyhow::Result;
/// use dust::deno::js_executor::JSExecutor;
/// use tokio::try_join;
///
/// // create a worker on the main thread init
///
/// async fn test(wait: usize) -> Result<()> {
///     println!("here {}", wait);
///     let js_code = format!(
///         r#"
///         _fun = (env) => {{
///             let a = 0;
///             for (var i = 0; i < 1000000 * {wait}; i ++) {{
///                a += 1;
///             }}
///             env.state.INPUT.wait = "{wait}";
///             return env.state.INPUT;
///         }}
///     "#
///     );
///     let env = serde_json::json!({ "state": { "INPUT": { "foo": "bar" } } });
///     let timeout = std::time::Duration::from_secs(10);
///
///     let (r, _): (HashMap<String, String>, Vec<serde_json::Value>) = JSExecutor::client()?
///         .exec(&js_code, "_fun", env, timeout)
///         .await?;
///     println!("there {:?}", r);
///
///     Ok(())
/// }
///
/// async fn mutli_test() -> Result<()> {
///     try_join!(test(5), test(2), test(7), test(1), test(3), test(4),)?;
///
///     println!("sleeping for 2s");
///     tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
///     Ok(())
/// }
///
/// fn main() {
///     JSExecutor::init();
///
///     let runtime = tokio::runtime::Builder::new_multi_thread()
///         .worker_threads(32)
///         .enable_all()
///         .max_blocking_threads(4)
///         .build()
///         .unwrap();
///
///     if let Err(error) = runtime.block_on(mutli_test()) {
///         eprintln!("error: {}", error);
///     }
/// }
/// ```
impl JSExecutor {
    pub fn init() {
        let (executor, client) = JSExecutor::new();
        JSExecutor::start(executor);
        let mut guard = JS_CLIENT.write();
        *guard = Some(client);
    }

    pub fn client() -> Result<JSClient> {
        let js_client = {
            let guard = JS_CLIENT.read();
            guard.clone()
        };
        match js_client {
            Some(c) => Ok(c),
            None => Err(anyhow!("JSExecutor not initialized")),
        }
    }

    // JSExecutor must be created and started on the main thread of the Rust program. The returned
    // client can be cloned and used in any thread or tokio worker.
    pub fn new() -> (Self, JSClient) {
        let (tx, rx) = mpsc::channel();
        (JSExecutor { rx }, JSClient { tx })
    }

    pub fn start(mut executor: JSExecutor) -> std::thread::JoinHandle<()> {
        std::thread::spawn(move || {
            // Init the Deno/v8 platform in the main JSExecutor thread.
            // see https://docs.rs/deno_core/latest/deno_core/struct.JsRuntime.html
            JsRuntime::init_platform(None);

            match executor.run() {
                Ok(_) => {}
                Err(e) => {
                    println!("JSExecutor shutdown: {:?}", e);
                    // Channel hang up we are just shutting down.
                }
            }
        })
    }

    async fn exec(
        js_code: String,
        fn_name: String,
        json_args: serde_json::Value,
        timeout: Duration,
    ) -> Result<ValueWithLogs> {
        let json_args_str = serde_json::to_string(&json_args)?;

        let code = format!(
            "let __rust_logs = [];
             const console = {{ log: function(...args) {{
                 __rust_logs = __rust_logs.concat(args)
             }} }};

             {js_code}

             (async () => {{
		     	let __rust_result = {fn_name}.constructor.name === 'AsyncFunction'
		     		? await {fn_name}({json_args_str})
		     		: {fn_name}({json_args});

		     	if (typeof __rust_result === 'undefined')
		     		__rust_result = null;

                 return {{value: __rust_result, logs: __rust_logs}};
		     }})()"
        );

        let mut runtime = JsRuntime::new(RuntimeOptions {
            ..Default::default()
        });

        let promise = runtime.execute_script("code_block.js", code)?;

        let handle = runtime.v8_isolate().thread_safe_handle();

        tokio::task::spawn(async move {
            tokio::time::sleep(timeout).await;
            handle.terminate_execution();
        });

        #[allow(deprecated)]
        let value = runtime.resolve_value(promise).await?;

        let result = {
            let scope = &mut runtime.handle_scope();
            let local = v8::Local::new(scope, value);
            // Deserialize a `v8` object into a Rust type using `serde_v8`,
            // in this case deserialize to a JSON `Value`.
            serde_v8::from_v8::<ValueWithLogs>(scope, local)
        };

        match result {
            Ok(r) => Ok(r),
            Err(err) => Err(anyhow!("Code block deserialization error: {err:?}")),
        }
    }

    fn run(&mut self) -> Result<()> {
        loop {
            let r = match self.rx.recv() {
                Ok(r) => r,
                Err(_) => break,
            };

            // We don't join or store handles since these executions are blocking runs which are
            // awaited on the tokio runtime.
            std::thread::spawn(move || {
                let rt = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .unwrap();

                let v = rt.block_on(async {
                    tokio::time::timeout(
                        // This is mostly defense in depth as the exec function will also attempt
                        // to terminate the execution after the timeout. We therefore add a buffer.
                        r.timeout.add(Duration::from_secs(1)),
                        JSExecutor::exec(r.js_code, r.fn_name, r.json_args, r.timeout),
                    )
                    .await?
                });

                match r.response_channel.send(v) {
                    Ok(_) => {}
                    Err(_) => {
                        eprintln!("JSClient request response channel error");
                    }
                }
            });
        }
        Err(anyhow!("main channel has hanged up"))
    }
}
