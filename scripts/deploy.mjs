#!/usr/bin/env node
// Non-interactive deploy of this workspace to a Make app, driven by the Make CLI
// (`@makehq/cli`). The CLI has no "push a local makecomapp.json" command — it exposes one
// write per section — so this walks the manifest and issues those writes in dependency order.
//
// Authentication comes from the CLI's own env vars: MAKE_API_KEY and MAKE_ZONE.
// Pass --dry-run to print the commands without running them.
//
// Connections and webhooks are addressed in Make by their *remote* name, which Make generates
// on creation. Those names live in the origin's `idMapping`; a component with no mapping is
// skipped with a warning rather than guessed at.

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const manifest = JSON.parse(readFileSync(join(APP_ROOT, 'makecomapp.json'), 'utf8'));

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const originLabel = args.find((a) => a.startsWith('--origin='))?.slice('--origin='.length);

const origin = originLabel
  ? manifest.origins.find((o) => o.label === originLabel)
  : manifest.origins[0];
if (!origin) throw new Error(`No origin${originLabel ? ` labelled "${originLabel}"` : ''} in makecomapp.json`);

const APP = ['--name=' + origin.appId, '--version=' + origin.appVersion];
const APP_SCOPED = ['--app-name=' + origin.appId, '--app-version=' + origin.appVersion];

// Local code type -> the section name the Make API uses.
const SECTION = {
  module: {
    communication: 'api',
    staticParams: 'parameters',
    mappableParams: 'expect',
    interface: 'interface',
    samples: 'samples',
    epoch: 'epoch',
  },
  rpc: { communication: 'api', params: 'parameters' },
  webhook: {
    communication: 'api',
    params: 'parameters',
    attach: 'attach',
    detach: 'detach',
    update: 'update',
  },
  connection: { communication: 'api', params: 'parameters' },
};

const read = (relPath) => readFileSync(join(APP_ROOT, relPath), 'utf8');

let failures = 0;
function cli(...argv) {
  const printable = ['make-cli', ...argv.map((a) => (a.length > 60 ? a.slice(0, 57) + '...' : a))].join(' ');
  if (dryRun) {
    console.log('DRY  ' + printable);
    return;
  }
  console.log('RUN  ' + printable);
  const result = spawnSync('npx', ['--yes', '@makehq/cli', ...argv], { stdio: 'inherit' });
  if (result.status !== 0) {
    failures += 1;
    console.error(`     failed with exit code ${result.status}`);
  }
}

const remoteName = (type, localId) => {
  const mapped = (origin.idMapping?.[type] ?? []).find((m) => m.local === localId);
  return mapped?.remote ?? null;
};

// 1. App-level codes.
const general = manifest.generalCodeFiles;
if (general.base) cli('sdk-apps', 'set-section', ...APP, '--section=base', '--body=' + read(general.base));
if (general.groups) cli('sdk-apps', 'set-section', ...APP, '--section=groups', '--body=' + read(general.groups));
if (general.common) cli('sdk-apps', 'set-common', ...APP, '--common=' + read(general.common));
if (general.readme) cli('sdk-apps', 'set-docs', ...APP, '--docs=' + read(general.readme));

// 2. Connections, then webhooks, then RPCs, then modules — the order Make needs so that
//    references (module -> connection, instant trigger -> webhook, param -> rpc) already resolve.
for (const type of ['connection', 'webhook', 'rpc', 'module']) {
  for (const [localId, meta] of Object.entries(manifest.components[type] ?? {})) {
    if (!meta) continue;
    const sections = SECTION[type];
    const nameFlag = (() => {
      switch (type) {
        case 'connection': {
          const remote = remoteName('connection', localId);
          return remote ? ['--connection-name=' + remote] : null;
        }
        case 'webhook': {
          const remote = remoteName('webhook', localId);
          return remote ? ['--webhook-name=' + remote] : null;
        }
        case 'rpc':
          return [...APP_SCOPED, '--rpc-name=' + localId];
        case 'module':
          return [...APP_SCOPED, '--module-name=' + localId];
        default:
          return null;
      }
    })();

    if (!nameFlag) {
      console.warn(
        `SKIP ${type} "${localId}" — Make generates its remote name on creation and makecomapp.json ` +
          `has no idMapping entry yet. Create it once from the Make Apps Editor, pull, then re-run.`,
      );
      continue;
    }

    const cmd = { connection: 'sdk-connections', webhook: 'sdk-webhooks', rpc: 'sdk-rpcs', module: 'sdk-modules' }[type];
    for (const [code, relPath] of Object.entries(meta.codeFiles ?? {})) {
      if (relPath === null) continue;
      const section = sections[code];
      if (!section) continue;
      cli(cmd, 'set-section', ...nameFlag, '--section=' + section, '--body=' + read(relPath));
    }
    if (type === 'connection' && meta.codeFiles?.common) {
      cli(cmd, 'set-common', ...nameFlag, '--common=' + read(meta.codeFiles.common));
    }
  }
}

if (failures) {
  console.error(`\n${failures} deploy step(s) failed.`);
  process.exit(1);
}
console.log(`\nDeployed ${origin.appId} v${origin.appVersion} to ${origin.baseUrl}${dryRun ? ' (dry run)' : ''}.`);
