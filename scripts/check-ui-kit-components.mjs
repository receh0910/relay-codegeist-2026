#!/usr/bin/env node
/**
 * check-ui-kit-components.mjs — Bug #6 regression guard (26 Nov 2026).
 *
 * Forge UI Kit renders ONLY components exported by @forge/react. A raw HTML
 * tag such as <strong> passes esbuild/JSX parsing and `forge lint`, but the
 * Forge renderer rejects it at runtime with
 *   "Error rendering app - encountered unknown component strong."
 * …and the whole page/panel fails to render. That is exactly what happened
 * to the Radar after the Bug #5 fix (three <strong> tags in radar.jsx and
 * issuePanel.jsx, deployed as dev 4.3.0 / prod 3.1.0).
 *
 * This script MUST run before every `forge deploy` (dev and production):
 *   node scripts/check-ui-kit-components.mjs
 *
 * What it checks, for every file in src/frontend/:
 *  1. No lowercase JSX tag (raw HTML: strong, b, em, span, div, p, …).
 *  2. Every import from '@forge/react' is in the allowlist parsed from the
 *     installed @forge/react type definitions (ui-kit-components.d.ts +
 *     components/index.d.ts + hooks in index.d.ts + default ForgeReconciler).
 *  3. Every Capitalized JSX tag is either imported from '@forge/react',
 *     imported from a relative module, defined locally in the same file,
 *     or a React.* namespace member (React.StrictMode).
 *
 * Exit code 0 = PASS, 1 = FAIL (with file:line for every violation).
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND = join(ROOT, 'src', 'frontend');
const REACT_TYPES = join(ROOT, 'node_modules', '@forge', 'react', 'out');

function parseAllowlist() {
  const allowed = new Set(['ForgeReconciler']); // default export
  const uiKit = join(REACT_TYPES, 'components', 'ui-kit-components.d.ts');
  const index = join(REACT_TYPES, 'components', 'index.d.ts');
  const mainIndex = join(REACT_TYPES, 'index.d.ts');
  for (const f of [uiKit, index]) {
    if (!existsSync(f)) continue;
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/export declare const ([A-Za-z0-9_]+)/g)) allowed.add(m[1]);
    for (const m of src.matchAll(/export \{ ([^}]+) \}/g)) {
      for (const name of m[1].split(',')) allowed.add(name.trim().split(/\s+as\s+/).pop().trim());
    }
  }
  if (existsSync(mainIndex)) {
    const src = readFileSync(mainIndex, 'utf8');
    for (const m of src.matchAll(/export \{ ([^}]+) \} from '\.\/hooks\/[^']+'/g)) {
      for (const name of m[1].split(',')) {
        const clean = name.trim().split(/\s+as\s+/).pop().trim();
        if (/^use[A-Z]/.test(clean) || clean === 'I18nProvider') allowed.add(clean);
      }
    }
  }
  return allowed;
}

function localDefinitions(src) {
  const defs = new Set();
  for (const m of src.matchAll(/^(?:export )?(?:const|let|function|class)\s+([A-Z][A-Za-z0-9_]*)/gm)) defs.add(m[1]);
  return defs;
}

function importsFrom(src, moduleName) {
  const names = new Set();
  const re = new RegExp(`import\\s+(?:([A-Za-z0-9_]+)\\s*,\\s*)?\\{([^}]*)\\}\\s+from\\s+['"]${moduleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`, 'g');
  for (const m of src.matchAll(re)) {
    if (m[1]) names.add(m[1]);
    for (const part of m[2].split(',')) {
      const clean = part.trim().split(/\s+as\s+/).pop().trim();
      if (clean) names.add(clean);
    }
  }
  return names;
}

const allowed = parseAllowlist();
const errors = [];
const files = readdirSync(FRONTEND).filter((f) => f.endsWith('.jsx') || f.endsWith('.js'));

for (const file of files) {
  const path = join(FRONTEND, file);
  const src = readFileSync(path, 'utf8');
  const lines = src.split('\n');

  // Rule 2: imports from '@forge/react' must be in the allowlist.
  for (const name of importsFrom(src, '@forge/react')) {
    if (!allowed.has(name)) {
      errors.push(`${file}: import '${name}' from '@forge/react' is NOT an exported @forge/react component (v${JSON.parse(readFileSync(join(REACT_TYPES, '..', 'package.json'), 'utf8')).version})`);
    }
  }

  const local = localDefinitions(src);
  const relativeImports = new Set();
  for (const m of src.matchAll(/import\s+(?:[A-Za-z0-9_]+\s*,\s*)?\{([^}]*)\}\s+from\s+['"]\.\/[^'"]+['"]/g)) {
    for (const part of m[1].split(',')) {
      const clean = part.trim().split(/\s+as\s+/).pop().trim();
      if (clean) relativeImports.add(clean);
    }
  }

  // Rules 1 + 3: every JSX tag.
  const tagRe = /<([A-Za-z][A-Za-z0-9.]*)(?=[\s/>])/g;
  let m;
  while ((m = tagRe.exec(src)) !== null) {
    const tag = m[1];
    const lineNo = src.slice(0, m.index).split('\n').length;
    const line = lines[lineNo - 1];
    if (/^[a-z]/.test(tag)) {
      errors.push(`${file}:${lineNo}: raw HTML tag <${tag}> — Forge UI Kit only renders @forge/react components (Bug #6): ${line.trim()}`);
      continue;
    }
    if (tag.includes('.')) {
      const [ns] = tag.split('.');
      if (ns !== 'React') errors.push(`${file}:${lineNo}: unknown namespaced component <${tag}>`);
      continue;
    }
    if (local.has(tag) || relativeImports.has(tag)) continue;
    if (!allowed.has(tag)) {
      errors.push(`${file}:${lineNo}: <${tag}> is not imported from '@forge/react', not defined locally, and not in the @forge/react allowlist`);
    }
  }
}

if (errors.length) {
  console.error(`FAIL: ${errors.length} UI Kit component violation(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  console.error(`Allowlist source: @forge/react out/components/ui-kit-components.d.ts (${allowed.size} names).`);
  process.exit(1);
}
console.log(`PASS: ${files.length} frontend file(s), all JSX tags are valid @forge/react components (${allowed.size} in allowlist).`);
