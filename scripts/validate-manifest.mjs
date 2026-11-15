// Offline manifest check: validates manifest.yml against the official Forge JSON schema
// (shipped in @forge/manifest) and cross-checks function / resource references.
// `forge lint` does the same and more once you are logged in.
import { readFileSync, existsSync } from 'node:fs';
import yaml from 'js-yaml';
import Ajv from 'ajv';

const schema = JSON.parse(readFileSync('node_modules/@forge/manifest/out/schema/manifest-schema.json', 'utf8'));
const manifest = yaml.load(readFileSync('manifest.yml', 'utf8'));

const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false });
const validate = ajv.compile(schema);
const problems = [];
if (!validate(manifest)) {
  for (const e of validate.errors ?? []) problems.push(`${e.instancePath || '/'} ${e.message} ${JSON.stringify(e.params)}`);
}

const functions = new Set((manifest.modules.function ?? []).map((f) => f.key));
const resources = new Set((manifest.resources ?? []).map((r) => r.key));
const actions = new Set((manifest.modules.action ?? []).map((a) => a.key));
const index = readFileSync('src/index.ts', 'utf8');
for (const f of manifest.modules.function ?? []) {
  const exported = f.handler.split('.')[1];
  if (!new RegExp(`\\b${exported}\\b`).test(index)) problems.push(`function ${f.key}: handler ${f.handler} is not exported from src/index.ts`);
}
for (const [type, list] of Object.entries(manifest.modules)) {
  for (const m of list) {
    const fn = m.function ?? m.resolver?.function;
    if (fn && !functions.has(fn)) problems.push(`${type}/${m.key}: unknown function ${fn}`);
    if (m.resource && !resources.has(m.resource)) problems.push(`${type}/${m.key}: unknown resource ${m.resource}`);
    for (const a of m.actions ?? m.tools ?? []) if (!actions.has(a)) problems.push(`${type}/${m.key}: unknown action ${a}`);
  }
}
for (const r of manifest.resources ?? []) {
  if (r.path.endsWith('.tsx') && !existsSync(r.path)) problems.push(`resource ${r.key}: ${r.path} does not exist`);
}

if (problems.length) {
  console.error(`manifest.yml has ${problems.length} problem(s):`);
  for (const p of [...new Set(problems)].slice(0, 40)) console.error(' - ' + p);
  process.exit(1);
}
console.log(`manifest.yml is valid: ${Object.values(manifest.modules).flat().length} modules, ${functions.size} functions, ${actions.size} actions`);
