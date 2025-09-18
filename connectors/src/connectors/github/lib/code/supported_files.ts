import { extname } from "path";

const EXTENSION_WHITELIST = [
  // Programming Languages - General Purpose
  ".js",
  ".ts",
  ".tsx",
  ".jsx",
  ".py",
  ".rb",
  ".exs", // Elixir script
  ".rs",
  ".go",
  ".swift",
  ".java",
  ".c",
  ".h",
  ".cc",
  ".cpp",
  ".hpp",
  ".php",
  ".scala",
  ".kt", // Kotlin
  ".neon", // PHP configuration
  ".phtml", // PHP template
  ".twig", // PHP template
  ".module", // Drupal module

  ".xhtml", // XML/HTML
  ".xsd", // XML Schema Definition

  // .NET Ecosystem
  ".cs",
  ".csproj", // XML-based
  ".sln", // Text-based solution file
  ".cshtml", // Razor template
  ".razor", // Razor component
  ".resx", // XML-based resource
  ".vb", // Visual Basic
  ".fs", // F#
  ".fsproj", // XML-based F# project
  ".props", // MSBuild properties (XML)
  ".targets", // MSBuild targets (XML)
  ".nuspec", // NuGet specification (XML)

  // Web Technologies
  ".html",
  ".htm",
  ".css",
  ".scss",
  ".sass",
  ".less",

  // Data & Configuration
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".env",
  ".conf",
  ".config",
  ".avsc", // Apache Avro schema definition
  ".avdl", // Apache Avro IDL definition

  // Build & Dependencies
  ".gradle",
  ".lock", // Text-based lock files
  ".mk", // Makefile
  ".just", // Justfile
  ".dockerfile",
  ".editorconfig",

  // Infrastructure as Code
  ".tf", // Terraform
  ".hcl", // HashiCorp Configuration Language
  ".nix", // Nix expressions

  // Documentation
  ".md", // Markdown
  ".mdx", // Markdown with JSX
  ".rst", // ReStructured Text
  ".adoc", // AsciiDoc
  ".tex", // LaTeX
  ".txt",
  ".patch",
  ".dsl", // Structurizr domain-specific language

  // Shell & Scripts
  ".sh",
  ".sql",
  ".kts", // Kotlin script

  // Version Control
  ".gitignore",
  ".dockerignore",

  // Testing
  ".test.cs",
  ".spec.cs",
  ".tests.cs",

  // Templates
  ".liquid",
  ".mustache",
  ".handlebars",
];

const SUFFIX_BLACKLIST = [".min.js", ".min.css"];

const FILENAME_WHITELIST = [
  "README",
  "Dockerfile",
  "package.json",
  "Cargo.toml",
  ".authors",
];

const DIRECTORY_BLACKLIST = [
  "node_modules",
  "vendor",
  "dist",
  "build",
  "coverage",
  "pkg",
  "bundle",
  "built",
  "eggs",
  "downloads",
  "env",
  "venv",
  "tmp",
  "temp",
  "debug",
  "target",
];

export function isSupportedFile(fileName: string) {
  const ext = extname(fileName).toLowerCase();

  const isWhitelisted =
    (EXTENSION_WHITELIST.includes(ext) ||
      FILENAME_WHITELIST.includes(fileName)) &&
    !SUFFIX_BLACKLIST.some((suffix) => fileName.endsWith(suffix));

  return isWhitelisted;
}

export function isSupportedDirectory(dirName: string) {
  return !DIRECTORY_BLACKLIST.includes(dirName);
}
