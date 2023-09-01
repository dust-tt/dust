use anyhow::Result;
use deno_core::{op, Extension, JsRuntime, Op, OpState};
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::borrow::Cow;
use std::rc::Rc;
use std::time::Duration;

pub struct Script {
    runtime: JsRuntime,
    last_rid: u32,
    timeout: Option<Duration>,
}

impl Script {
    const DEFAULT_FILENAME: &'static str = "code_block.js";

    pub fn from_string(js_code: &str) -> Result<Self> {
        // console.log() is not available by default -- add the most basic version with single
        // argument (and no warn/info/... variants)
        let all_code = "let __rust_logs = [];
            const console = { log: function(...args) {
                __rust_logs = __rust_logs.concat(args)
            } };"
            .to_string()
            + js_code;

        Self::create_script(all_code)
    }

    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        assert!(self.timeout.is_none());
        assert!(timeout > Duration::ZERO);

        self.timeout = Some(timeout);
        self
    }

    fn create_script(js_code: String) -> Result<Self> {
        let ext = Extension {
            name: "script",
            ops: Cow::Owned(vec![(op_return::DECL)]),
            ..Default::default()
        };

        let options = deno_core::RuntimeOptions {
            module_loader: Some(Rc::new(deno_core::FsModuleLoader)),
            extensions: vec![ext],
            ..Default::default()
        };

        let mut runtime = JsRuntime::new(options);

        // We cannot provide a dynamic filename because execute_script() requires a &'static str
        runtime.execute_script(Self::DEFAULT_FILENAME, js_code.into())?;

        Ok(Script {
            runtime,
            last_rid: 0,
            timeout: None,
        })
    }

    pub fn call<A, R>(&mut self, fn_name: &str, arg: A) -> Result<(R, Vec<serde_json::Value>)>
    where
        A: Serialize,
        R: DeserializeOwned,
    {
        let json_arg = serde_json::to_value(arg)?.to_string();
        let (json_result, logs) = self.call_impl(fn_name, json_arg)?;
        let result: R = serde_json::from_value(json_result)?;

        Ok((result, logs))
    }

    fn call_impl(
        &mut self,
        fn_name: &str,
        json_args: String,
    ) -> Result<(serde_json::Value, Vec<serde_json::Value>)> {
        // Note: ops() is required to initialize internal state
        // Wrap everything in scoped block

        // 'undefined' will cause JSON serialization error, so it needs to be treated as null
        let js_code = format!(
            "(async () => {{
				let __rust_result = {fn_name}.constructor.name === 'AsyncFunction'
					? await {fn_name}({json_args})
					: {fn_name}({json_args});

				if (typeof __rust_result === 'undefined')
					__rust_result = null;

				Deno.core.ops.op_return({{value: __rust_result, logs: __rust_logs}});
			}})()"
        );

        // println!("CALLING SCRIPT:\n{}", js_code);

        if let Some(timeout) = self.timeout {
            let handle = self.runtime.v8_isolate().thread_safe_handle();

            tokio::task::spawn(async move {
                tokio::time::sleep(timeout).await;
                handle.terminate_execution();
            });
        }

        // syncing ops is required cause they sometimes change while preparing the engine
        // self.runtime.sync_ops_cache();

        // TODO use strongly typed JsError here (downcast)
        self.runtime
            .execute_script(Self::DEFAULT_FILENAME, js_code.into())?;
        deno_core::futures::executor::block_on(self.runtime.run_event_loop(false))?;

        let state_rc = self.runtime.op_state();
        let mut state = state_rc.borrow_mut();
        let table = &mut state.resource_table;

        // Get resource, and free slot (no longer needed)
        let entry: Rc<ResultResource> = table
            .take(self.last_rid)
            .expect("Resource entry must be present");
        let extracted =
            Rc::try_unwrap(entry).expect("Rc must hold single strong ref to resource entry");
        self.last_rid += 1;

        let output = extracted.json_value;

        let return_value = output["value"].clone();

        match output.get("logs") {
            Some(serde_json::Value::Array(logs)) => Ok((return_value, logs.clone())),
            _ => Ok((return_value, vec![])),
        }
    }
}

#[derive(Debug)]
struct ResultResource {
    json_value: serde_json::Value,
}

// Type that is stored inside Deno's resource table
impl deno_core::Resource for ResultResource {
    fn name(&self) -> Cow<str> {
        "__rust_Result".into()
    }
}

#[op]
fn op_return(
    state: &mut OpState,
    args: serde_json::Value,
) -> Result<serde_json::Value, deno_core::error::AnyError> {
    let entry = ResultResource { json_value: args };
    let resource_table = &mut state.resource_table;
    let _rid = resource_table.add(entry);
    Ok(serde_json::Value::Null)
}
