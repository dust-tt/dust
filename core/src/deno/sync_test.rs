use anyhow::{anyhow, Result};
use deno_core::{serde_v8, v8, JsRuntime, RuntimeOptions};
use serde::de::DeserializeOwned;
use serde::Serialize;

#[derive(serde::Serialize, serde::Deserialize)]
struct ValueWithLogs<R> {
    value: R,
    logs: Vec<serde_json::Value>,
}

pub fn call<A, R>(js_code: &str, fn_name: &str, arg: A) -> Result<(R, Vec<serde_json::Value>)>
where
    A: Serialize,
    R: DeserializeOwned,
{
    let json_args = serde_json::to_value(arg)?.to_string();
    // let (json_result, logs) = self.call_impl(fn_name, json_arg)?;
    // let result: R = serde_json::from_value(json_result)?;

    let mut runtime = JsRuntime::new(RuntimeOptions::default());

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

    // inline definition of a type { value: R, logs: Vec<serde_json::Value> }

    match runtime.execute_script("code_block.js", code) {
        Ok(global) => {
            let scope = &mut runtime.handle_scope();
            let local = v8::Local::new(scope, global);
            // Deserialize a `v8` object into a Rust type using `serde_v8`,
            // in this case deserialize to a JSON `Value`.
            let result = serde_v8::from_v8::<ValueWithLogs<R>>(scope, local);

            match result {
                Ok(r) => Ok((r.value, r.logs)),
                Err(err) => Err(anyhow!("Code block deserialization error: {err:?}")),
            }
        }
        Err(err) => Err(anyhow!("Code block evaluation error: {err:?}")),
    }
}
