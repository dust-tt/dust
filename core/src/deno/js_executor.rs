use std::{sync::mpsc, time::Duration};

use anyhow::{anyhow, Result};
use deno_core::{error::AnyError, serde_v8, v8, JsRuntime, RuntimeOptions};
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
    arguments: serde_json::Value,
    timeout: Duration,
}

#[derive(Debug, Clone)]
pub struct JSClient {
    tx: mpsc::Sender<JSRequest>,
}

impl JSClient {
    pub async fn exec(
        &self,
        js_code: String,
        fn_name: String,
        arguments: serde_json::Value,
        timeout: Duration,
    ) -> Result<ValueWithLogs> {
        let (tx, rx) = oneshot::channel();
        let r = JSRequest {
            response_channel: tx,
            js_code,
            fn_name,
            arguments,
            timeout,
        };

        self.tx.send(r).unwrap();
        rx.await?
    }
}

pub struct JSExecutor {
    rx: mpsc::Receiver<JSRequest>,
}

impl JSExecutor {
    // JSExecutor must be created ans started on the main thread of the Rust program. The returned
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
        arguments: serde_json::Value,
        timeout: Duration,
    ) -> Result<ValueWithLogs> {
        let json_args = serde_json::to_string(&arguments)?;

        let code = format!(
            "let __rust_logs = [];
             const console = {{ log: function(...args) {{
                 __rust_logs = __rust_logs.concat(args)
             }} }};

             {js_code}

             (async () => {{
		     	let __rust_result = {fn_name}.constructor.name === 'AsyncFunction'
		     		? await {fn_name}({json_args})
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

        // let ok = runtime.v8_isolate().cancel_terminate_execution();
        // println!("ok: {:?}", ok);

        let result = {
            let scope = &mut runtime.handle_scope();
            let local = v8::Local::new(scope, value);
            // Deserialize a `v8` object into a Rust type using `serde_v8`,
            // in this case deserialize to a JSON `Value`.
            serde_v8::from_v8::<ValueWithLogs>(scope, local)
        };

        println!(">>>>> DROPPING");
        drop(runtime);
        println!(">>>>> DROPED");

        match result {
            Ok(r) => {
                println!("HERE >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> 6");
                println!("value: {:?}", r.value);
                Ok(r)
            }
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
                        r.timeout,
                        JSExecutor::exec(r.js_code, r.fn_name, r.arguments, r.timeout),
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
