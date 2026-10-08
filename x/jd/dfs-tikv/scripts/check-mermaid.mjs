import { JSDOM } from 'jsdom';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { resolve } from 'node:path';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Element = dom.window.Element;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.SVGElement = dom.window.SVGElement;
const { default: mermaid } = await import('mermaid');
mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
const root = resolve(process.argv[2]);
const results = [];
const errors = [];
const documents = (await readdir(resolve(root, 'docs'))).filter(name => name.endsWith('.md')).sort().map(name => `docs/${name}`);
documents.push(...process.argv.slice(4));
for (const name of documents) {
    const source = await readFile(resolve(root, name), 'utf8');
    let index = 0;
    for (const match of source.matchAll(/```mermaid\s*\n([\s\S]*?)```/g)) {
        try {
            const parsed = await mermaid.parse(match[1]);
            results.push({ document: name, index, type: parsed.diagramType });
        } catch (error) {
            errors.push({ document: name, index, message: error instanceof Error ? error.message : String(error) });
        }
        index++;

    }
}
const result = { host: hostname(), passed: errors.length === 0, errors, diagrams: results, scope: 'Mermaid parser validation; no visual layout rendering' };
await writeFile(resolve(root, process.argv[3] ?? 'results/cache-rework/mermaid-check.json'), JSON.stringify(result, null, 2) + '\n');
process.stdout.write(JSON.stringify({ passed: result.passed, diagrams: results.length, errors }) + '\n');
process.exitCode = result.passed ? 0 : 1;
