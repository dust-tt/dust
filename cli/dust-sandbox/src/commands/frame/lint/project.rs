use std::fs;
use std::os::unix::fs::symlink;
use std::path::{Path, PathBuf};
use std::process::Stdio;

use anyhow::{ensure, Context};
use serde_json::json;
use tokio::process::Command;

use super::runtime_types::RuntimeTypes;
use super::source::{is_source_file, FrameSource};

pub(super) struct LintOutput {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
}

pub(super) async fn check(
    source: &FrameSource,
    types: &RuntimeTypes,
) -> anyhow::Result<LintOutput> {
    let staging = tempfile::tempdir()?;
    let project = staging.path().canonicalize()?;
    let entry = source.entry.strip_prefix(&source.root)?;
    let mut tsconfig = json!({
        "extends": types.directory.join("tsconfig.json"),
        "compilerOptions": { "preserveSymlinks": true },
        "files": [&source.entry],
        "include": []
    });
    fs::write(
        project.join("tsconfig.json"),
        serde_json::to_vec(&tsconfig)?,
    )?;
    let config = project.join(".oxlintrc.json");
    fs::write(&config, serde_json::to_vec(&lint_config(&types.modules))?)?;
    // Let TypeScript resolve the imports so backend functions outside the UI graph are skipped.
    let listed = Command::new("tsc")
        .args(["--listFilesOnly", "--pretty", "false", "--project"])
        .arg(project.join("tsconfig.json"))
        .stdin(Stdio::null())
        .kill_on_drop(true)
        .output()
        .await
        .context("TypeScript is unavailable. Install the sandbox Frame lint tools")?;
    // TypeScript still lists imports when a source has syntax errors. Oxlint reports those errors.
    let files: Vec<PathBuf> = String::from_utf8_lossy(&listed.stdout)
        .lines()
        .map(PathBuf::from)
        .filter(|file| file.starts_with(&source.root) && !file.starts_with(&types.directory))
        .collect();
    ensure!(
        files.contains(&source.entry),
        "failed to resolve Frame imports:\n{}{}",
        source_paths(&listed.stdout, &project, &source.root),
        source_paths(&listed.stderr, &project, &source.root)
    );
    // Oxlint discovers tsconfig.json beside each file, so give it a project containing only UI imports.
    let mut lint_files = Vec::new();
    for file in files {
        let target = project.join(file.strip_prefix(&source.root)?);
        fs::create_dir_all(target.parent().context("source file has no parent")?)?;
        symlink(&file, &target)
            .with_context(|| format!("failed to stage Frame source: {}", file.display()))?;
        if is_source_file(&file) {
            lint_files.push(target);
        }
    }
    tsconfig["files"] = json!([entry]);
    fs::write(
        project.join("tsconfig.json"),
        serde_json::to_vec(&tsconfig)?,
    )?;
    let output = Command::new("oxlint")
        .args([
            "--type-aware",
            "--type-check",
            "--disable-nested-config",
            "--no-ignore",
            "--format",
            "unix",
            "--config",
        ])
        .arg(config)
        .arg("--")
        .args(lint_files)
        .current_dir(&source.root)
        .stdin(Stdio::null())
        .kill_on_drop(true)
        .output()
        .await
        .context("Oxlint is unavailable. Install the sandbox Frame lint tools")?;
    Ok(LintOutput {
        success: output.status.success(),
        stdout: source_paths(&output.stdout, &project, &source.root),
        stderr: source_paths(&output.stderr, &project, &source.root),
    })
}

fn source_paths(bytes: &[u8], project: &Path, original: &Path) -> String {
    String::from_utf8_lossy(bytes).replace(
        project.to_string_lossy().as_ref(),
        original.to_string_lossy().as_ref(),
    )
}

fn lint_config(modules: &[String]) -> serde_json::Value {
    // !*/ lets the exceptions below match scoped packages such as @dust/react-hooks.
    let mut allowed = vec!["*".to_owned(), "!*/".to_owned()];
    allowed.extend(modules.iter().map(|module| format!("!{module}")));
    allowed.extend(
        [
            "!./**",
            "!../**",
            "!fil_*",
            "!conversation-*",
            "!conversation-*/**",
            "!pod-*",
            "!pod-*/**",
            "!conversation/**",
            "!pod/**",
            "!project/**",
        ]
        .map(str::to_owned),
    );
    json!({
        "plugins": ["typescript", "react"],
        "categories": { "correctness": "off" },
        "rules": {
            "typescript/no-floating-promises": "error",
            "react/rules-of-hooks": "error",
            "no-restricted-imports": ["error", { "patterns": [{
                "group": allowed,
                "caseSensitive": true,
                "message": format!("Frame libraries: {}. Relative imports and Dust file references are also supported", modules.join(", "))
            }] }]
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn checks_imported_sources_at_original_locations_without_changing_user_config() {
        let directory = tempfile::tempdir().expect("Frame directory");
        let root = directory.path().canonicalize().expect("canonical root");
        let types_directory = tempfile::tempdir().expect("types directory");
        let types = RuntimeTypes {
            directory: types_directory
                .path()
                .canonicalize()
                .expect("canonical types"),
            modules: vec!["react".to_owned()],
        };
        fs::write(
            types.directory.join("tsconfig.json"),
            serde_json::to_vec(&json!({
                "compilerOptions": {
                    "target": "ES2020", "module": "ESNext", "moduleResolution": "Bundler",
                    "strict": true, "noEmit": true, "types": [], "jsx": "preserve",
                    "allowJs": true, "checkJs": true, "resolveJsonModule": true, "esModuleInterop": true
                }
            }))
            .expect("serialize types config"),
        )
        .expect("write types config");
        let user_config = r#"{"compilerOptions":{"strict":false},"files":[]}"#;
        fs::write(root.join("tsconfig.json"), user_config).expect("write user config");
        fs::write(
            root.join("index.tsx"),
            "import { value } from './value'; export default () => value",
        )
        .expect("write entry");
        fs::write(
            root.join("value.ts"),
            "// Original line one\nexport const value: number = 'wrong'\n",
        )
        .expect("write imported helper");
        fs::write(
            root.join("server.ts"),
            "import { database } from 'unsupported-server-library';\n",
        )
        .expect("write unrelated backend");
        let source = FrameSource::resolve(&root).expect("Frame source");
        let broken = check(&source, &types).await.expect("run actual linter");
        assert!(!broken.success, "{}{}", broken.stdout, broken.stderr);
        assert!(
            broken
                .stdout
                .contains(&format!("{}:2:14:", root.join("value.ts").display())),
            "{}",
            broken.stdout
        );
        assert!(broken.stdout.contains("TS2322"));
        assert!(!broken.stdout.contains("server.ts"));
        assert_eq!(
            fs::read_to_string(root.join("tsconfig.json")).expect("user config"),
            user_config
        );
        assert!(!root.join(".oxlintrc.json").exists());

        fs::write(root.join("data.json"), r#"{"value":42}"#).expect("write local JSON");
        fs::write(
            root.join("shape.d.ts"),
            "export interface Data { value: number }",
        )
        .expect("write local type");
        fs::write(root.join("value.ts"), "import data from './data.json'; import type { Data } from './shape'; const typed: Data = data; export const value = typed.value\n").expect("fix helper");
        let valid = check(&source, &types).await.expect("lint fixed Frame");
        assert!(valid.success, "{}{}", valid.stdout, valid.stderr);

        fs::write(
            root.join("index.tsx"),
            "import { value } from './value.js'; export default () => value",
        )
        .expect("import JavaScript");
        fs::write(root.join("value.js"), "export const value: number = 1")
            .expect("invalid JavaScript");
        fs::remove_file(root.join("value.ts")).expect("remove TS helper");
        let javascript = check(&source, &types).await.expect("lint JavaScript");
        assert!(!javascript.success);
        assert!(
            javascript.stdout.contains("value.js:1:"),
            "{}",
            javascript.stdout
        );
    }
}
