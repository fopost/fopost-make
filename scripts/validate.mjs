#!/usr/bin/env node
// Offline checks for the Make app definition. Make's platform cannot be run locally and
// publishes no offline validator, so this asserts JSON validity plus the conventions this
// app relies on. Node built-ins only.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_ROOT = join(ROOT, 'src');
const MANIFEST = join(APP_ROOT, 'makecomapp.json');

const BASE_URL = 'https://api.fopost.com/v1';
const API_HOST = 'https://api.fopost.com';
const MAKE_ORIGIN_RE = /^https:\/\/.+\/api$/;

// Codes every module must ship. `mappableParams` is the local name of the API `expect` section.
const REQUIRED_MODULE_CODES = ['communication', 'mappableParams', 'interface', 'samples'];

const ID_RULES = {
  module: /^[a-zA-Z][0-9a-zA-Z]{2,63}$/,
  rpc: /^[a-zA-Z][0-9a-zA-Z]{2,63}$/,
  function: /^[a-zA-Z][0-9a-zA-Z]{1,94}[0-9a-zA-Z]$/,
  connection: /^[a-zA-Z][0-9a-zA-Z-]{1,33}[0-9a-zA-Z]$/,
  webhook: /^[a-zA-Z][0-9a-zA-Z-]{1,33}[0-9a-zA-Z]$/,
  endpoint: /^[a-zA-Z][0-9a-zA-Z]{1,126}[0-9a-zA-Z]$/,
};

const errors = [];
const checks = [];
const fail = (msg) => errors.push(msg);
const pass = (msg) => checks.push(msg);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git' || entry === '.secrets') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(ROOT).filter((f) => /\.(json|imljson)$/.test(f));
const rel = (f) => relative(ROOT, f).split(/[\\/]/).join('/');

// ---------------------------------------------------------------- JSON validity
const parsed = new Map();
for (const file of files) {
  const raw = readFileSync(file, 'utf8');
  try {
    parsed.set(file, JSON.parse(raw));
  } catch (err) {
    fail(`${rel(file)}: invalid JSON — ${err.message}`);
  }
}
if (parsed.size === files.length) pass(`${files.length} JSON files parse`);

// ------------------------------------------------------------------ no secrets
const SECRET_PATTERNS = [
  [/\bfp_[A-Za-z0-9_-]{16,}/, 'looks like a literal FoPost API key'],
  [/["']X-API-Key["']\s*:\s*["'](?!\{\{)[^"']{8,}/i, 'hard-codes an X-API-Key value'],
  [/["']x-automation-secret["']\s*:\s*["'](?!\{\{)[^"']{8,}/i, 'hard-codes an automation secret'],
  [/\bapikey["']?\s*[:=]\s*["'](?!\{\{)[A-Za-z0-9_-]{16,}["']/i, 'hard-codes an API key'],
];
let secretsClean = true;
for (const file of [...files, ...walk(ROOT).filter((f) => /\.(md|ya?ml|mjs)$/.test(f))]) {
  const raw = readFileSync(file, 'utf8');
  for (const [re, why] of SECRET_PATTERNS) {
    if (re.test(raw)) {
      fail(`${rel(file)}: ${why}`);
      secretsClean = false;
    }
  }
}
if (secretsClean) pass('no hard-coded API keys or secrets');

// ------------------------------------------------------------------- manifest
if (!parsed.has(MANIFEST)) {
  fail('src/makecomapp.json is missing or unparseable');
  report();
}
const manifest = parsed.get(MANIFEST);

if (manifest.fileVersion !== 1) fail(`src/makecomapp.json: fileVersion must be 1, found ${manifest.fileVersion}`);
for (const key of ['fileVersion', 'generalCodeFiles', 'components', 'origins']) {
  if (!(key in manifest)) fail(`src/makecomapp.json: missing required key "${key}"`);
}
for (const type of ['connection', 'webhook', 'module', 'rpc', 'function', 'endpoint']) {
  if (!(type in (manifest.components ?? {}))) fail(`src/makecomapp.json: components.${type} must be present (may be {})`);
}
for (const key of ['base', 'common', 'readme', 'groups']) {
  if (!(key in (manifest.generalCodeFiles ?? {}))) fail(`src/makecomapp.json: generalCodeFiles.${key} must be present`);
}
for (const origin of manifest.origins ?? []) {
  for (const key of ['baseUrl', 'appId', 'appVersion', 'apikeyFile']) {
    if (!(key in origin)) fail(`src/makecomapp.json: origin "${origin.label ?? '?'}" is missing "${key}"`);
  }
  if (origin.baseUrl && !MAKE_ORIGIN_RE.test(origin.baseUrl)) {
    fail(`src/makecomapp.json: origin baseUrl "${origin.baseUrl}" must be a Make zone URL ending in /api`);
  }
  if (origin.appId && !/^[a-z][0-9a-z-]{1,28}[0-9a-z]$/.test(origin.appId)) {
    fail(`src/makecomapp.json: origin appId "${origin.appId}" is not a valid Make app id`);
  }
  if (origin.apikeyFile && !origin.apikeyFile.includes('.secrets')) {
    fail(`src/makecomapp.json: origin apikeyFile "${origin.apikeyFile}" must live under .secrets/ (git-ignored)`);
  }
}
if (!errors.length) pass('makecomapp.json structure and origins');

// ------------------------------------------------- every referenced file exists
const referenced = new Set();
const resolveCode = (p) => join(APP_ROOT, p);
for (const [key, path] of Object.entries(manifest.generalCodeFiles ?? {})) {
  if (path === null) continue;
  referenced.add(posix.normalize(path));
  try {
    statSync(resolveCode(path));
  } catch {
    fail(`generalCodeFiles.${key} points at missing file src/${path}`);
  }
}
for (const [type, components] of Object.entries(manifest.components ?? {})) {
  for (const [id, meta] of Object.entries(components ?? {})) {
    if (ID_RULES[type] && !ID_RULES[type].test(id)) {
      fail(`components.${type}.${id}: id does not match Make's naming rule for a ${type}`);
    }
    if (!meta || !meta.codeFiles) {
      fail(`components.${type}.${id}: missing codeFiles`);
      continue;
    }
    for (const [code, path] of Object.entries(meta.codeFiles)) {
      if (path === null) continue;
      referenced.add(posix.normalize(path));
      try {
        statSync(resolveCode(path));
      } catch {
        fail(`components.${type}.${id}.codeFiles.${code} points at missing file src/${path}`);
      }
    }
  }
}

// Nothing under src/ should be orphaned from the manifest.
for (const file of walk(APP_ROOT)) {
  const p = relative(APP_ROOT, file).split(/[\\/]/).join('/');
  if (p === 'makecomapp.json') continue;
  if (!referenced.has(p)) fail(`src/${p} is not referenced by makecomapp.json`);
}

// ------------------------------------------------------ module / rpc conventions
const moduleIds = Object.keys(manifest.components?.module ?? {});
const rpcIds = new Set(Object.keys(manifest.components?.rpc ?? {}));

for (const [id, meta] of Object.entries(manifest.components?.module ?? {})) {
  for (const code of REQUIRED_MODULE_CODES) {
    if (!meta.codeFiles?.[code]) fail(`module "${id}" has no ${code} file`);
  }
  if (!meta.label) fail(`module "${id}" has no label`);
  if (!meta.description) fail(`module "${id}" has no description`);
  if (!meta.moduleType) fail(`module "${id}" has no moduleType`);
  if (meta.moduleType === 'trigger' && !meta.codeFiles?.epoch) {
    fail(`polling trigger "${id}" has no epoch file`);
  }
  if (meta.moduleType === 'instant_trigger' && !meta.webhook) {
    fail(`instant trigger "${id}" does not name a webhook`);
  }
  if (meta.webhook && !(manifest.components?.webhook ?? {})[meta.webhook]) {
    fail(`module "${id}" references unknown webhook "${meta.webhook}"`);
  }
  if (meta.connection && !(manifest.components?.connection ?? {})[meta.connection]) {
    fail(`module "${id}" references unknown connection "${meta.connection}"`);
  }
  // A trigger's samples must be an object (one bundle), an interface must be an array.
  const iface = parsed.get(resolveCode(meta.codeFiles.interface));
  if (iface !== undefined && !Array.isArray(iface)) fail(`module "${id}": interface must be a JSON array`);
  const samples = parsed.get(resolveCode(meta.codeFiles.samples));
  if (samples !== undefined && (typeof samples !== 'object' || Array.isArray(samples))) {
    fail(`module "${id}": samples must be a JSON object representing one output bundle`);
  }
}
for (const [id, meta] of Object.entries(manifest.components?.rpc ?? {})) {
  if (!meta.codeFiles?.communication) fail(`rpc "${id}" has no communication file`);
  if (!meta.connection) fail(`rpc "${id}" has no connection — a module using it will refuse to open`);
}
if (!errors.length) pass(`${moduleIds.length} modules carry communication, mappable params, interface and samples`);

// -------------------------------------------------------- rpc:// references resolve
let rpcRefs = 0;
for (const [file, doc] of parsed) {
  const raw = JSON.stringify(doc);
  for (const match of raw.matchAll(/rpc:\/\/([A-Za-z0-9]+)/g)) {
    rpcRefs += 1;
    if (!rpcIds.has(match[1])) fail(`${rel(file)}: references rpc://${match[1]} but no such RPC is declared`);
  }
}
if (rpcRefs > 0 && !errors.length) pass(`${rpcRefs} rpc:// references resolve to declared RPCs`);

// ------------------------------------------------------------------- base URL
const base = parsed.get(join(APP_ROOT, 'general', 'base.iml.json'));
if (!base) fail('src/general/base.iml.json is missing');
else {
  if (base.baseUrl !== BASE_URL) fail(`base.baseUrl must be "${BASE_URL}", found "${base.baseUrl}"`);
  if (base.headers?.['X-API-Key'] !== '{{connection.apiKey}}') {
    fail('base must send the connection API key as the X-API-Key header');
  }
  if (!base.response?.error?.['402']) fail('base is missing the 402 (payment required) error mapping');
  if (!base.response?.error?.['429']) fail('base is missing the 429 (rate limit) error mapping');
  if (base.response?.error?.['429']?.type !== 'RateLimitError') {
    fail('base must map 429 onto Make\'s RateLimitError so the scenario is paused, not failed');
  }
  if (!base.response?.error?.message) fail('base is missing the default error message mapping');
  if (!(base.log?.sanitize ?? []).some((p) => p.toLowerCase().includes('x-api-key'))) {
    fail('base must sanitize the X-API-Key request header from logs');
  }
  if (!errors.length) pass('base URL, auth header, error mapping and log sanitization');
}

// Every other absolute URL in the app must point at the documented API host.
for (const [file, doc] of parsed) {
  for (const match of JSON.stringify(doc).matchAll(/https:\/\/[a-z0-9.-]+/gi)) {
    const host = match[0];
    if (host.startsWith(API_HOST)) continue;
    if (host === 'https://fopost.com' || host === 'https://cdn.yourbrand.com' || host === 'https://yourbrand.com') continue;
    if (host === 'https://www.linkedin.com') continue;
    if (MAKE_ORIGIN_RE.test(host + '/api') || host.endsWith('make.com')) continue;
    fail(`${rel(file)}: unexpected absolute URL host "${host}"`);
  }
}

// --------------------------------------------------------------------- groups
const groups = parsed.get(resolveCode(manifest.generalCodeFiles.groups));
if (!Array.isArray(groups)) fail('modules/groups.json must be a JSON array');
else {
  const grouped = new Set();
  for (const group of groups) {
    if (!group.label) fail('modules/groups.json: a group has no label');
    for (const name of group.modules ?? []) {
      if (!moduleIds.includes(name)) fail(`modules/groups.json: group "${group.label}" lists unknown module "${name}"`);
      grouped.add(name);
    }
  }
  const ungrouped = moduleIds.filter((m) => !grouped.has(m));
  if (ungrouped.length) fail(`modules/groups.json: not categorized module(s): ${ungrouped.join(', ')}`);
  else pass('every module belongs to a group');
}

// ------------------------------------------------------------- connection shape
const connectionIds = Object.keys(manifest.components?.connection ?? {});
if (connectionIds.length !== 1) fail(`expected exactly one connection, found ${connectionIds.length}`);
for (const [id, meta] of Object.entries(manifest.components?.connection ?? {})) {
  if (meta.connectionType !== 'basic') fail(`connection "${id}" must be of type "basic" (API key)`);
  const params = parsed.get(resolveCode(meta.codeFiles.params));
  if (!Array.isArray(params)) fail(`connection "${id}": params must be a JSON array`);
  else {
    const apiKey = params.find((p) => p.name === 'apiKey');
    if (!apiKey) fail(`connection "${id}": no "apiKey" parameter`);
    else if (apiKey.type !== 'password') fail(`connection "${id}": the apiKey parameter must be of type "password" so Make masks it`);
  }
  const comm = parsed.get(resolveCode(meta.codeFiles.communication));
  if (comm && comm.url !== '/workspaces') {
    fail(`connection "${id}": the verification request should call /workspaces so Make checks the key on save`);
  }
  if (comm && comm.response?.data?.apiKey !== '{{parameters.apiKey}}') {
    fail(`connection "${id}": must persist the key via response.data.apiKey for base to read it back`);
  }
}
if (!errors.length) pass('API key connection verifies against GET /workspaces');

report();

function report() {
  for (const c of checks) console.log(`  ok  ${c}`);
  if (errors.length) {
    console.error(`\n${errors.length} problem(s):`);
    for (const e of errors) console.error(`  ✗  ${e}`);
    process.exit(1);
  }
  console.log(`\nfopost-make: ${files.length} files validated, no problems found.`);
  process.exit(0);
}
