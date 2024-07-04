use crate::blocks::block::{parse_pair, Block, BlockResult, BlockType, Env};
use crate::deno::script::{async_call, call, safe_async_call, Script};
use crate::Rule;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use pest::iterators::Pair;
// use rustyscript::{js_value::Promise, json_args, Error, Module, Runtime};
use serde_json::{json, Value};
use tokio::sync::mpsc::UnboundedSender;

#[derive(Clone)]
pub struct Code {
    code: String,
}

impl Code {
    pub fn parse(block_pair: Pair<Rule>) -> Result<Self> {
        let mut code: Option<String> = None;

        for pair in block_pair.into_inner() {
            match pair.as_rule() {
                Rule::pair => {
                    let (key, value) = parse_pair(pair)?;
                    match key.as_str() {
                        "code" => code = Some(value),
                        _ => Err(anyhow!("Unexpected `{}` in `code` block", key))?,
                    }
                }
                Rule::expected => Err(anyhow!("`expected` is not yet supported in `code` block"))?,
                _ => unreachable!(),
            }
        }

        if !code.is_some() {
            Err(anyhow!("Missing required `code` in `code` block"))?;
        }

        Ok(Code {
            code: code.unwrap(),
        })
    }
}

#[async_trait]
impl Block for Code {
    fn block_type(&self) -> BlockType {
        BlockType::Code
    }

    fn inner_hash(&self) -> String {
        let mut hasher = blake3::Hasher::new();
        hasher.update("code".as_bytes());
        hasher.update(self.code.as_bytes());
        format!("{}", hasher.finalize().to_hex())
    }

    async fn execute(
        &self,
        _name: &str,
        env: &Env,
        _event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<BlockResult> {
        // Assumes there is a _fun function defined in `source`.
        // TODO(spolu): revisit, not sure this is optimal.
        let env = env.clone();
        let code = self.code.clone();

        let timeout = std::time::Duration::from_secs(10);

        // let module = Module::new(
        //     "test.js",
        //     "
        // function resolve_after(t) {
        //     new Promise((resolve) => {
        //         return setTimeout(() => {
        //             console.log('Finished after ' + t + 'ms');
        //             resolve('resolved');
        //         }, t);
        //     });
        // }
        // export const f1 = async () => resolve_after(4000);
        // export const f2 = async () => resolve_after(2000);
        // export const f3 = async () => resolve_after(1000);
        // ",
        // );

        // let mut runtime = Runtime::new(Default::default())?;
        // let handle = runtime.load_module(&module)?;
        // let tokio_runtime = runtime.tokio_runtime();

        // let future = async {
        //     let v1: String = runtime
        //         .call_function_async(Some(&handle), "f1", json_args!())
        //         .await?;
        //     let v2: String = runtime
        //         .call_function_async(Some(&handle), "f2", json_args!())
        //         .await?;
        //     let v3: String = runtime
        //         .call_function_async(Some(&handle), "f3", json_args!())
        //         .await?;

        //     println!("v1={}\nv2={}\nv3={}", v1, v2, v3);

        //     Ok::<(), Error>(())
        // };
        // tokio_runtime.block_on(async move { future.await })?;

        println!(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>HERE~!!!!!!!!!!!!!!!!!");

        // let r = tokio::task::spawn_blocking(move || {
        //     let r = std::thread::spawn(move || {
        //         let rt = tokio::runtime::Builder::new_current_thread()
        //             .enable_all()
        //             .thread_keep_alive(timeout)
        //             .build()
        //             .unwrap();

        //         let local = tokio::task::LocalSet::new();
        //         let r = local.block_on(&rt, async {
        //             let r = tokio::task::spawn_local(async move {
        //                 safe_async_call(&code, "_fun", &env, Some(timeout)).await
        //             })
        //             .await?;
        //             r
        //         });
        //         r
        //         // let r = local
        //         //     .run_until(async {
        //         //         let r = tokio::task::spawn_local(async move {
        //         //             safe_async_call(&code, "_fun", &env, Some(timeout)).await
        //         //         })
        //         //         .await?;
        //         //         r
        //         //     })
        //         //     .await?;
        //         // r
        //     });
        //     r.join()
        // })
        // .await;

        let r = tokio::task::spawn_blocking(move || {
            call(&code, "_fun", &env, Some(timeout))
            // let rt = tokio::runtime::Builder::new_current_thread()
            //     .enable_all()
            //     .thread_keep_alive(timeout)
            //     .build()
            //     .unwrap();

            // // call(&code, "_fun", &env, Some(timeout))
            // rt.block_on(async move {
            //     tokio::time::timeout(timeout, async_call(&code, "_fun", &env, Some(timeout))).await
            // })
        })
        .await??;

        println!("HHHHHHHHHHHHHHHHHHHHHHHHHEEERE DONE\n");

        // tokio::task::spawn_blocking(move || {
        //     call(
        //         &code,
        //         "_fun",
        //         &env,
        //         Some(std::time::Duration::from_secs(10)),
        //     )
        // });

        //.map_err(|e| anyhow!("Error in `code`: {}", e))?;
        // ktokio::task::spawn_blocking(move || {
        //     // let mut script = Script::from_string(code.as_str())?
        //     //     .with_timeout(std::time::Duration::from_secs(10));
        //     // script.call("_fun", &env)
        // })
        //.await??;
        Ok(BlockResult {
            value: json!({}),
            meta: Some(json!({ "logs": [] })),
        })
    }

    fn clone_box(&self) -> Box<dyn Block + Sync + Send> {
        Box::new(self.clone())
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
}
