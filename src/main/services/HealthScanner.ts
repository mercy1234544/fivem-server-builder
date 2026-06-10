import fs from 'fs';
import path from 'path';
import axios from 'axios';
import extractZip from 'extract-zip';
import os from 'os';

export interface HealthIssue {
  id: string;
  severity: 'error' | 'warning' | 'info';
  category: string;
  message: string;
  resource?: string;
  file?: string;
  suggestion?: string;
  autoFixable: boolean;
}

export interface HealthReport {
  serverId?: string;
  timestamp: string;
  issues: HealthIssue[];
  score: number;
  summary: {
    errors: number;
    warnings: number;
    info: number;
  };
}

export class HealthScanner {
  async scanServer(serverPath: string, consoleLogs?: string[]): Promise<HealthReport> {
    const issues: HealthIssue[] = [];

    await this.checkServerCfg(serverPath, issues);
    await this.checkBaseResources(serverPath, issues);
    await this.checkResources(serverPath, issues);
    await this.checkDependencies(serverPath, issues);
    await this.checkDuplicates(serverPath, issues);
    await this.checkStartupOrder(serverPath, issues);

    if (consoleLogs && consoleLogs.length > 0) {
      this.checkConsoleLogs(consoleLogs, issues);
    }

    // Deduplicate — if same category+resource appears multiple times, keep the most severe
    const deduped = new Map<string, HealthIssue>();
    for (const issue of issues) {
      const key = `${issue.category}:${issue.resource || issue.id}`;
      const existing = deduped.get(key);
      if (!existing) {
        deduped.set(key, issue);
      } else {
        const sevOrder = { error: 0, warning: 1, info: 2 };
        if (sevOrder[issue.severity] < sevOrder[existing.severity]) {
          deduped.set(key, issue);
        }
      }
    }
    issues.length = 0;
    issues.push(...deduped.values());

    const summary = {
      errors: issues.filter(i => i.severity === 'error').length,
      warnings: issues.filter(i => i.severity === 'warning').length,
      info: issues.filter(i => i.severity === 'info').length,
    };

    const maxScore = 100;
    const deductions = summary.errors * 15 + summary.warnings * 5 + summary.info * 1;
    const score = Math.max(0, maxScore - deductions);

    return {
      timestamp: new Date().toISOString(),
      issues,
      score,
      summary,
    };
  }

  private async checkServerCfg(serverPath: string, issues: HealthIssue[]) {
    const cfgPath = path.join(serverPath, 'server.cfg');

    if (!fs.existsSync(cfgPath)) {
      issues.push({
        id: 'missing-server-cfg',
        severity: 'error',
        category: 'Configuration',
        message: 'server.cfg not found',
        suggestion: 'Create a server.cfg file in the server root directory',
        autoFixable: false,
      });
      return;
    }

    const content = fs.readFileSync(cfgPath, 'utf-8');

    // Check for uncommented changeme license key (commented out is fine — txAdmin handles it)
    const hasUncommentedChangeme = content.split('\n').some(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') || trimmed.startsWith('//')) return false;
      return trimmed.includes('sv_licenseKey') && (trimmed.includes('changeme') || trimmed.includes('change_me'));
    });
    if (hasUncommentedChangeme) {
      issues.push({
        id: 'default-license-key',
        severity: 'error',
        category: 'Configuration',
        message: 'License key has not been set',
        file: cfgPath,
        suggestion: 'Set your FiveM license key from keymaster.fivem.net or use txAdmin to configure it',
        autoFixable: true,
      });
    }

    if (!content.includes('endpoint_add_tcp') && !content.includes('endpoint_add_udp')) {
      issues.push({
        id: 'missing-endpoints',
        severity: 'error',
        category: 'Configuration',
        message: 'No network endpoints configured',
        file: cfgPath,
        suggestion: 'Add endpoint_add_tcp and endpoint_add_udp directives',
        autoFixable: true,
      });
    }

    if (!content.includes('onesync')) {
      issues.push({
        id: 'onesync-not-set',
        severity: 'warning',
        category: 'Configuration',
        message: 'OneSync is not explicitly configured',
        file: cfgPath,
        suggestion: 'Add "set onesync on" to enable OneSync',
        autoFixable: true,
      });
    }
  }

  private async checkBaseResources(serverPath: string, issues: HealthIssue[]) {
    const resourcesPath = path.join(serverPath, 'resources');
    if (!fs.existsSync(resourcesPath)) return;

    const baseResources = [
      'mapmanager', 'chat', 'spawnmanager', 'sessionmanager',
      'basic-gamemode', 'hardcap', 'baseevents',
    ];

    const missing: string[] = [];
    for (const name of baseResources) {
      if (!this.resourceExists(resourcesPath, name)) {
        missing.push(name);
      }
    }

    if (missing.length > 0) {
      issues.push({
        id: 'missing-base-resources',
        severity: 'error',
        category: 'Base Resources',
        message: `Missing ${missing.length} base FiveM resources: ${missing.join(', ')}`,
        suggestion: 'Download cfx-server-data base resources (mapmanager, chat, spawnmanager, etc.)',
        autoFixable: true,
      });
    }
  }

  private async checkResources(serverPath: string, issues: HealthIssue[]) {
    const resourcesPath = path.join(serverPath, 'resources');
    if (!fs.existsSync(resourcesPath)) {
      issues.push({
        id: 'missing-resources-dir',
        severity: 'error',
        category: 'Resources',
        message: 'Resources directory not found',
        suggestion: 'Create a resources directory',
        autoFixable: true,
      });
      return;
    }

    await this.scanResourceDir(resourcesPath, issues);
  }

  private async scanResourceDir(dir: string, issues: HealthIssue[]) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const fullPath = path.join(dir, entry.name);
      const fxManifest = path.join(fullPath, 'fxmanifest.lua');
      const oldManifest = path.join(fullPath, '__resource.lua');

      if (fs.existsSync(fxManifest)) {
        await this.checkManifest(fullPath, fxManifest, entry.name, issues);
      } else if (fs.existsSync(oldManifest)) {
        issues.push({
          id: `deprecated-manifest-${entry.name}`,
          severity: 'warning',
          category: 'Resources',
          message: `${entry.name} uses deprecated __resource.lua`,
          resource: entry.name,
          file: oldManifest,
          suggestion: 'Migrate to fxmanifest.lua format',
          autoFixable: false,
        });
      } else {
        const hasSubResources = fs.readdirSync(fullPath, { withFileTypes: true })
          .some(e => e.isDirectory());
        if (hasSubResources) {
          await this.scanResourceDir(fullPath, issues);
        }
      }
    }
  }

  private async checkManifest(resourcePath: string, manifestPath: string, name: string, issues: HealthIssue[]) {
    const content = fs.readFileSync(manifestPath, 'utf-8');

    if (!content.includes('fx_version')) {
      issues.push({
        id: `no-fx-version-${name}`,
        severity: 'error',
        category: 'Resources',
        message: `${name}: Missing fx_version directive`,
        resource: name,
        file: manifestPath,
        suggestion: 'Add fx_version \'cerulean\' to the manifest',
        autoFixable: true,
      });
    }

    if (!content.includes('game')) {
      issues.push({
        id: `no-game-${name}`,
        severity: 'error',
        category: 'Resources',
        message: `${name}: Missing game directive`,
        resource: name,
        file: manifestPath,
        suggestion: 'Add game \'gta5\' to the manifest',
        autoFixable: true,
      });
    }

    // Check for referenced files that don't exist
    const clientScripts = this.extractScriptPaths(content, 'client_script');
    const serverScripts = this.extractScriptPaths(content, 'server_script');
    const sharedScripts = this.extractScriptPaths(content, 'shared_script');

    for (const script of [...clientScripts, ...serverScripts, ...sharedScripts]) {
      if (script.includes('*') || script.includes('@')) continue;
      const scriptPath = path.join(resourcePath, script);
      if (!fs.existsSync(scriptPath)) {
        issues.push({
          id: `missing-script-${name}-${script}`,
          severity: 'error',
          category: 'Resources',
          message: `${name}: Referenced script not found: ${script}`,
          resource: name,
          file: manifestPath,
          suggestion: `Create the file ${script} or remove it from the manifest`,
          autoFixable: false,
        });
      }
    }
  }

  private extractScriptPaths(content: string, directive: string): string[] {
    const paths: string[] = [];

    // Strip Lua line comments (-- ...) before parsing to avoid false positives
    const stripped = content.split('\n').map(line => {
      // Remove inline comments: everything after -- that's not inside a string
      // Simple approach: remove lines that are purely comments, and strip trailing comments
      const trimmed = line.trim();
      if (trimmed.startsWith('--')) return ''; // full-line comment
      // For inline comments, be conservative — just return the line as-is
      return line;
    }).join('\n');

    const singlePattern = new RegExp(`${directive}s?\\s+['"]([^'"]+)['"]`, 'g');
    const blockPattern = new RegExp(`${directive}s?\\s*\\{([^}]+)\\}`, 'gs');

    let match;
    while ((match = singlePattern.exec(stripped)) !== null) {
      const p = match[1].trim();
      if (p && !p.startsWith('--') && p.length > 1) {
        paths.push(p);
      }
    }
    while ((match = blockPattern.exec(stripped)) !== null) {
      const blockContent = match[1];
      // Extract quoted strings from the block
      const items = blockContent.matchAll(/['"]([^'"]+)['"]/g);
      for (const item of items) {
        const p = item[1].trim();
        // Skip empty, comment-like, or garbage entries
        if (!p || p.length <= 1) continue;
        if (p.startsWith('--')) continue;
        if (p === ',' || p === ' ') continue;
        // Must look like a file path (has an extension or is a glob)
        if (!p.includes('.') && !p.includes('*') && !p.includes('@')) continue;
        paths.push(p);
      }
    }
    return paths;
  }

  private async checkDependencies(serverPath: string, issues: HealthIssue[]) {
    const cfgPath = path.join(serverPath, 'server.cfg');
    if (!fs.existsSync(cfgPath)) return;

    // Also check additional .cfg files referenced by exec directives
    const cfgFiles = [cfgPath];
    const mainCfg = fs.readFileSync(cfgPath, 'utf-8');
    const execPattern = /^\s*exec\s+["']?(\S+?)["']?\s*$/gm;
    let execMatch;
    while ((execMatch = execPattern.exec(mainCfg)) !== null) {
      const extraCfg = path.join(serverPath, execMatch[1]);
      if (fs.existsSync(extraCfg)) cfgFiles.push(extraCfg);
    }

    const ensuredResources = new Set<string>();

    // Resources truly built into FXServer binary — not in resources/
    const builtinResources = new Set([
      'fivem', 'monitor', 'webpack', 'yarn',
    ]);

    for (const cfgFile of cfgFiles) {
      const cfg = fs.readFileSync(cfgFile, 'utf-8');
      for (const line of cfg.split('\n')) {
        const trimmed = line.trim();
        // Skip comments and empty lines
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
        const match = trimmed.match(/^(?:ensure|start)\s+(\S+)/);
        if (match) ensuredResources.add(match[1]);
      }
    }

    const resourcesPath = path.join(serverPath, 'resources');
    if (!fs.existsSync(resourcesPath)) return;

    for (const resourceName of ensuredResources) {
      // Skip builtin CFX resources
      if (builtinResources.has(resourceName)) continue;

      // Folder-based ensures like [ox], [qbx] — check if the folder exists
      if (resourceName.startsWith('[') && resourceName.endsWith(']')) {
        if (this.folderExists(resourcesPath, resourceName)) continue;
        issues.push({
          id: `missing-resource-folder-${resourceName}`,
          severity: 'warning',
          category: 'Dependencies',
          message: `Resource folder "${resourceName}" is ensured but not found`,
          suggestion: `Create the ${resourceName} folder in resources or remove it from server.cfg`,
          autoFixable: false,
        });
        continue;
      }

      if (!this.resourceExists(resourcesPath, resourceName)) {
        issues.push({
          id: `missing-resource-${resourceName}`,
          severity: 'error',
          category: 'Dependencies',
          message: `Resource "${resourceName}" is ensured but not found in resources directory`,
          suggestion: `Install ${resourceName} or remove it from server.cfg`,
          autoFixable: false,
        });
      }
    }
  }

  private folderExists(resourcesDir: string, folderName: string): boolean {
    // Check direct child
    if (fs.existsSync(path.join(resourcesDir, folderName))) return true;
    // Check nested (e.g. resources/[something]/[folderName])
    try {
      for (const entry of fs.readdirSync(resourcesDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (fs.existsSync(path.join(resourcesDir, entry.name, folderName))) return true;
      }
    } catch {}
    return false;
  }

  private resourceExists(resourcesDir: string, name: string): boolean {
    const search = (dir: string): boolean => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name === name) {
          const fullPath = path.join(dir, entry.name);
          return fs.existsSync(path.join(fullPath, 'fxmanifest.lua')) ||
                 fs.existsSync(path.join(fullPath, '__resource.lua'));
        }
        const found = search(path.join(dir, entry.name));
        if (found) return true;
      }
      return false;
    };
    return search(resourcesDir);
  }

  private async checkDuplicates(serverPath: string, issues: HealthIssue[]) {
    const resourcesPath = path.join(serverPath, 'resources');
    if (!fs.existsSync(resourcesPath)) return;

    const resourceNames = new Map<string, string[]>();
    this.collectResourceNames(resourcesPath, resourceNames);

    for (const [name, paths] of resourceNames) {
      if (paths.length > 1) {
        issues.push({
          id: `duplicate-${name}`,
          severity: 'warning',
          category: 'Duplicates',
          message: `Resource "${name}" found in multiple locations`,
          resource: name,
          suggestion: `Remove duplicate copies. Found in: ${paths.join(', ')}`,
          autoFixable: false,
        });
      }
    }
  }

  private collectResourceNames(dir: string, map: Map<string, string[]>) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const fullPath = path.join(dir, entry.name);
      if (fs.existsSync(path.join(fullPath, 'fxmanifest.lua')) ||
          fs.existsSync(path.join(fullPath, '__resource.lua'))) {
        const existing = map.get(entry.name) || [];
        existing.push(fullPath);
        map.set(entry.name, existing);
      } else {
        this.collectResourceNames(fullPath, map);
      }
    }
  }

  private async checkStartupOrder(serverPath: string, issues: HealthIssue[]) {
    const cfgPath = path.join(serverPath, 'server.cfg');
    if (!fs.existsSync(cfgPath)) return;

    const content = fs.readFileSync(cfgPath, 'utf-8');
    const lines = content.split('\n');
    const ensureOrder: { name: string; lineIdx: number }[] = [];

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
      const match = trimmed.match(/^(?:ensure|start)\s+(\S+)/);
      if (match) ensureOrder.push({ name: match[1], lineIdx: i });
    }

    const indexOf = (name: string) => ensureOrder.findIndex(e => e.name === name);

    const frameworks = ['es_extended', 'qb-core', 'qbx_core'];
    const frameworkIdx = Math.max(...frameworks.map(f => indexOf(f)));

    const oxmysqlIdx = indexOf('oxmysql');
    const oxlibIdx = indexOf('ox_lib');
    const oxFolderIdx = indexOf('[ox]');

    // oxmysql must load before framework
    if (oxmysqlIdx > -1 && frameworkIdx > -1 && oxmysqlIdx > frameworkIdx) {
      issues.push({
        id: 'startup-order-mysql',
        severity: 'error',
        category: 'Startup Order',
        message: 'Database (oxmysql) must start before framework',
        suggestion: 'Move oxmysql above your framework in server.cfg',
        autoFixable: true,
      });
    }

    // ox_lib should load before framework
    if (oxlibIdx > -1 && frameworkIdx > -1 && oxlibIdx > frameworkIdx) {
      issues.push({
        id: 'startup-order-oxlib',
        severity: 'warning',
        category: 'Startup Order',
        message: 'ox_lib should start before framework',
        suggestion: 'Move ox_lib above your framework in server.cfg',
        autoFixable: true,
      });
    }

    // [ox] folder should load before framework (ox resources need framework)
    if (oxFolderIdx > -1 && frameworkIdx > -1 && oxFolderIdx < frameworkIdx) {
      issues.push({
        id: 'startup-order-ox-folder',
        severity: 'error',
        category: 'Startup Order',
        message: '[ox] resources load before framework — they need qbx_core/qb-core/es_extended first',
        suggestion: 'Move ensure [ox] below your framework in server.cfg',
        autoFixable: true,
      });
    }

    // Check [qbx] or [qb] loads after framework
    for (const folder of ['[qbx]', '[qb]', '[esx]']) {
      const folderIdx = indexOf(folder);
      if (folderIdx > -1 && frameworkIdx > -1 && folderIdx < frameworkIdx) {
        issues.push({
          id: `startup-order-${folder}`,
          severity: 'error',
          category: 'Startup Order',
          message: `${folder} resources load before framework — move below framework`,
          suggestion: `Move ensure ${folder} below your framework in server.cfg`,
          autoFixable: true,
        });
      }
    }
  }

  private checkConsoleLogs(logs: string[], issues: HealthIssue[]) {
    const failedResources: string[] = [];
    const buildPending: string[] = [];
    const scriptErrors: { resource: string; error: string; dep?: string }[] = [];
    let dbConnectionFailed = false;
    let dbConnectionString = '';
    const orderWarnings: { resource: string; needsBefore: string }[] = [];
    const frameworkWarnings: string[] = [];
    const seenIds = new Set<string>();

    for (const raw of logs) {
      const line = raw.trim();

      // Failed to start resource
      const failMatch = line.match(/Couldn't start resource (\S+)/i);
      if (failMatch) {
        const name = failMatch[1].replace(/\.$/, '');
        if (!failedResources.includes(name)) failedResources.push(name);
      }

      // Dependency failure — "Could not start dependency X for resource Y"
      const depMatch = line.match(/Could not start dependency (\S+) for resource (\S+)/i);
      if (depMatch) {
        const dep = depMatch[1];
        const res = depMatch[2].replace(/\.$/, '');
        if (!failedResources.includes(res)) failedResources.push(res);
        // Track the dependency that failed so we know why
        scriptErrors.push({ resource: res, error: `Dependency ${dep} not available`, dep });
      }

      // Build tasks still running — "Running build tasks on resource X"
      const buildMatch = line.match(/Running build tasks on resource (\S+)/);
      if (buildMatch) {
        buildPending.push(buildMatch[1]);
      }

      // Build completed — remove from pending
      const buildDone = line.match(/Build tasks completed.*resource (\S+)/);
      if (buildDone) {
        const idx = buildPending.indexOf(buildDone[1]);
        if (idx > -1) buildPending.splice(idx, 1);
      }

      // Script errors
      const scriptErrMatch = line.match(/SCRIPT ERROR: @([^/]+)\/.+?: (.+)/);
      if (scriptErrMatch) {
        const existing = scriptErrors.find(e => e.resource === scriptErrMatch[1]);
        if (!existing) {
          scriptErrors.push({ resource: scriptErrMatch[1], error: scriptErrMatch[2] });
        }
      }

      // Database connection failure
      if (line.includes('ECONNREFUSED') || line.includes('Unable to establish a connection to the database')) {
        dbConnectionFailed = true;
      }

      // Capture connection string info
      const connMatch = line.match(/connect ECONNREFUSED ([\d.]+:\d+)/);
      if (connMatch) dbConnectionString = connMatch[1];

      // "Warning: X is not loaded - it should start before Y"
      const orderMatch = line.match(/Warning: (\S+) is not loaded.*should start before (\S+)/);
      if (orderMatch) {
        orderWarnings.push({ resource: orderMatch[1], needsBefore: orderMatch[2] });
      }

      // "Warning: no compatible framework was loaded"
      if (line.includes('no compatible framework was loaded')) {
        const bracketMatch = raw.match(/^\[([^\]]+)\]/);
        const src = bracketMatch ? bracketMatch[1].trim().replace(/^script:/, '') : 'unknown';
        if (!frameworkWarnings.includes(src)) frameworkWarnings.push(src);
      }
    }

    // Failed resources — check if it's a build-timing issue (auto-fixable by restart)
    for (const name of failedResources) {
      const id = `runtime-failed-${name}`;
      if (seenIds.has(id)) continue;
      seenIds.add(id);

      const isBuildIssue = buildPending.some(bp =>
        scriptErrors.some(e => e.resource === name && e.dep === bp)
      );

      issues.push({
        id,
        severity: 'error',
        category: 'Runtime',
        message: `Resource "${name}" failed to start`,
        resource: name,
        suggestion: isBuildIssue
          ? `${name} failed because a dependency was still building. Restart the server to fix.`
          : `Check that ${name}'s dependencies are installed and started in the right order in server.cfg`,
        autoFixable: true,
      });
    }

    // Script errors (not already covered by failed resources)
    for (const { resource, error, dep } of scriptErrors) {
      if (dep) continue; // already reported as failed resource
      const id = `runtime-script-error-${resource}`;
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      issues.push({
        id,
        severity: 'error',
        category: 'Runtime',
        message: `Script error in ${resource}: ${error}`,
        resource,
        suggestion: `This is usually a load-order issue. The health scanner will try reordering resources in server.cfg.`,
        autoFixable: true,
      });
    }

    // Database connection issue
    if (dbConnectionFailed) {
      issues.push({
        id: 'runtime-db-connection',
        severity: 'error',
        category: 'Runtime',
        message: `Database connection failed${dbConnectionString ? ` (${dbConnectionString})` : ''}`,
        suggestion: 'Make sure MySQL/MariaDB is running and the mysql_connection_string in server.cfg is correct',
        autoFixable: false,
      });
    }

    // Resource order warnings — auto-fixable by reordering server.cfg
    for (const w of orderWarnings) {
      const id = `runtime-order-${w.resource}-before-${w.needsBefore}`;
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      issues.push({
        id,
        severity: 'warning',
        category: 'Startup Order',
        message: `${w.resource} should start before ${w.needsBefore}`,
        resource: w.resource,
        suggestion: `Move ensure ${w.resource} above ensure ${w.needsBefore} in server.cfg`,
        autoFixable: true,
      });
    }

    // Framework warnings — ox resources loaded before framework
    for (const resource of frameworkWarnings) {
      const id = `runtime-no-framework-${resource}`;
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      issues.push({
        id,
        severity: 'error',
        category: 'Startup Order',
        message: `${resource} loaded before framework — no compatible framework available`,
        resource,
        suggestion: `Move ${resource} (or its folder) below your framework (qbx_core/qb-core/es_extended) in server.cfg`,
        autoFixable: true,
      });
    }
  }

  private copyDirRecursive(src: string, dest: string) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        this.copyDirRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  async fixIssue(serverPath: string, issue: HealthIssue): Promise<boolean> {
    if (!issue.autoFixable) return false;

    const cfgPath = path.join(serverPath, 'server.cfg');

    // Fix missing endpoints — prepend to start of file (txAdmin requires them at top)
    if (issue.id === 'missing-endpoints') {
      let content = fs.readFileSync(cfgPath, 'utf-8');
      content = `endpoint_add_tcp "0.0.0.0:30120"\nendpoint_add_udp "0.0.0.0:30120"\n\n${content}`;
      fs.writeFileSync(cfgPath, content);
      return true;
    }

    // Fix missing onesync
    if (issue.id === 'onesync-not-set') {
      let content = fs.readFileSync(cfgPath, 'utf-8');
      content += '\nset onesync on\n';
      fs.writeFileSync(cfgPath, content);
      return true;
    }

    // Fix missing resources dir
    if (issue.id === 'missing-resources-dir') {
      fs.mkdirSync(path.join(serverPath, 'resources'), { recursive: true });
      return true;
    }

    // Fix missing fx_version in manifest
    if (issue.id.startsWith('no-fx-version-') && issue.file) {
      let content = fs.readFileSync(issue.file, 'utf-8');
      content = `fx_version 'cerulean'\n${content}`;
      fs.writeFileSync(issue.file, content);
      return true;
    }

    // Fix missing game directive in manifest
    if (issue.id.startsWith('no-game-') && issue.file) {
      let content = fs.readFileSync(issue.file, 'utf-8');
      if (content.includes('fx_version')) {
        content = content.replace(/(fx_version\s+['"][^'"]+['"])\n?/, `$1\ngame 'gta5'\n`);
      } else {
        content = `game 'gta5'\n${content}`;
      }
      fs.writeFileSync(issue.file, content);
      return true;
    }

    // Fix startup order — move resource before/after framework in server.cfg
    if (issue.id.startsWith('startup-order-')) {
      if (!fs.existsSync(cfgPath)) return false;
      return this.fixStartupOrder(cfgPath, issue);
    }

    // Fix runtime resource order issues detected from console
    if (issue.id.startsWith('runtime-order-') || issue.id.startsWith('runtime-no-framework-')) {
      if (!fs.existsSync(cfgPath)) return false;
      return this.fixRuntimeOrder(cfgPath, issue);
    }

    // Fix failed resources — add comment with restart hint
    if (issue.id.startsWith('runtime-failed-')) {
      // Nothing to change in files — this is a restart-needed situation
      console.log(`[HealthFix] Resource ${issue.resource} failed at runtime — restart server to retry`);
      return true;
    }

    // Fix script errors from load order
    if (issue.id.startsWith('runtime-script-error-') && issue.resource) {
      if (!fs.existsSync(cfgPath)) return false;
      return this.fixRuntimeOrder(cfgPath, issue);
    }

    // Fix missing base resources — download cfx-server-data
    if (issue.id === 'missing-base-resources') {
      const resourcesDir = path.join(serverPath, 'resources');
      const cfxDefaultDir = path.join(resourcesDir, '[cfx-default]');
      try {
        const zipUrl = 'https://github.com/citizenfx/cfx-server-data/archive/refs/heads/master.zip';
        const response = await axios.get(zipUrl, { responseType: 'arraybuffer', timeout: 120000 });
        const tempDir = os.tmpdir();
        const zipPath = path.join(tempDir, `cfx-server-data-${Date.now()}.zip`);
        fs.writeFileSync(zipPath, Buffer.from(response.data));

        const extractDir = path.join(tempDir, `cfx-data-extract-${Date.now()}`);
        fs.mkdirSync(extractDir, { recursive: true });
        await extractZip(zipPath, { dir: extractDir });

        const extracted = fs.readdirSync(extractDir);
        let innerDir = extracted.length === 1
          ? path.join(extractDir, extracted[0], 'resources')
          : path.join(extractDir, 'resources');

        if (fs.existsSync(innerDir)) {
          if (!fs.existsSync(cfxDefaultDir)) fs.mkdirSync(cfxDefaultDir, { recursive: true });
          this.copyDirRecursive(innerDir, cfxDefaultDir);
          console.log('[HealthFix] Downloaded cfx-server-data base resources');
        }

        try { fs.unlinkSync(zipPath); } catch {}
        try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch {}
        return true;
      } catch (err: any) {
        console.error('[HealthFix] Failed to download cfx-server-data:', err.message);
        return false;
      }
    }

    // Fix default license key
    if (issue.id === 'default-license-key') {
      if (!fs.existsSync(cfgPath)) return false;
      let content = fs.readFileSync(cfgPath, 'utf-8');
      content = content.split('\n').map(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('#') || trimmed.startsWith('//')) return line;
        if (trimmed.includes('sv_licenseKey') && (trimmed.includes('changeme') || trimmed.includes('change_me'))) {
          return `# ${line.trimStart()} # Removed by Health Scanner — set via txAdmin`;
        }
        return line;
      }).join('\n');
      fs.writeFileSync(cfgPath, content, 'utf-8');
      return true;
    }

    return false;
  }

  private fixStartupOrder(cfgPath: string, issue: HealthIssue): boolean {
    const content = fs.readFileSync(cfgPath, 'utf-8');
    const lines = content.split('\n');
    const frameworks = ['es_extended', 'qb-core', 'qbx_core'];

    // Find framework line index
    let frameworkIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^\s*(?:ensure|start)\s+(\S+)/);
      if (m && frameworks.includes(m[1])) { frameworkIdx = i; break; }
    }
    if (frameworkIdx === -1) return false;

    // "startup-order-ox-folder" or "startup-order-[qbx]" — move AFTER framework
    if (issue.id === 'startup-order-ox-folder' || issue.id.startsWith('startup-order-[')) {
      const folder = issue.id === 'startup-order-ox-folder' ? '[ox]'
        : issue.id.replace('startup-order-', '');
      return this.moveResourceLine(lines, cfgPath, folder, 'after', frameworkIdx);
    }

    // "startup-order-mysql" or "startup-order-oxlib" — move BEFORE framework
    if (issue.id === 'startup-order-mysql') {
      return this.moveResourceLine(lines, cfgPath, 'oxmysql', 'before', frameworkIdx);
    }
    if (issue.id === 'startup-order-oxlib') {
      return this.moveResourceLine(lines, cfgPath, 'ox_lib', 'before', frameworkIdx);
    }

    return false;
  }

  private fixRuntimeOrder(cfgPath: string, issue: HealthIssue): boolean {
    const content = fs.readFileSync(cfgPath, 'utf-8');
    const lines = content.split('\n');
    const frameworks = ['es_extended', 'qb-core', 'qbx_core'];

    // Find framework line
    let frameworkIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^\s*(?:ensure|start)\s+(\S+)/);
      if (m && frameworks.includes(m[1])) { frameworkIdx = i; break; }
    }

    // "runtime-order-X-before-Y" — move X before Y
    const orderMatch = issue.id.match(/^runtime-order-(\S+)-before-(\S+)/);
    if (orderMatch) {
      const [, resourceA, resourceB] = orderMatch;
      let bIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^\s*(?:ensure|start)\s+(\S+)/);
        if (m && m[1] === resourceB) { bIdx = i; break; }
      }
      if (bIdx > -1) {
        return this.moveResourceLine(lines, cfgPath, resourceA, 'before', bIdx);
      }
    }

    // "runtime-no-framework-X" — resource loaded before framework, move after
    if (issue.id.startsWith('runtime-no-framework-') && issue.resource && frameworkIdx > -1) {
      const resource = issue.resource;

      // First try direct match — is this resource ensured by name before framework?
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^\s*(?:ensure|start)\s+(\S+)/);
        if (m && m[1] === resource && i < frameworkIdx) {
          return this.moveResourceLine(lines, cfgPath, resource, 'after', frameworkIdx);
        }
      }

      // Otherwise find the folder that contains it (e.g. ox_doorlock is in [ox])
      // Common patterns: ox_ prefix → [ox], qbx_ prefix → [qbx], esx_ prefix → [esx]
      const folderGuesses: string[] = [];
      if (resource.startsWith('ox_')) folderGuesses.push('[ox]');
      if (resource.startsWith('qbx_')) folderGuesses.push('[qbx]');
      if (resource.startsWith('qb-') || resource.startsWith('qb_')) folderGuesses.push('[qb]');
      if (resource.startsWith('esx_')) folderGuesses.push('[esx]');

      for (const folder of folderGuesses) {
        for (let i = 0; i < lines.length; i++) {
          const m = lines[i].match(/^\s*(?:ensure|start)\s+(\S+)/);
          if (m && m[1] === folder && i < frameworkIdx) {
            return this.moveResourceLine(lines, cfgPath, folder, 'after', frameworkIdx);
          }
        }
      }
    }

    return false;
  }

  private moveResourceLine(lines: string[], cfgPath: string, resource: string, direction: 'before' | 'after', targetIdx: number): boolean {
    let sourceIdx = -1;
    let sourceLine = '';
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^\s*(?:ensure|start)\s+(\S+)/);
      if (m && m[1] === resource) { sourceIdx = i; sourceLine = lines[i]; break; }
    }
    if (sourceIdx === -1) return false;

    // Remove from current position
    lines.splice(sourceIdx, 1);
    // Adjust target if it shifted
    if (sourceIdx < targetIdx) targetIdx--;

    // Insert at new position
    const insertIdx = direction === 'before' ? targetIdx : targetIdx + 1;
    lines.splice(insertIdx, 0, sourceLine);

    fs.writeFileSync(cfgPath, lines.join('\n'), 'utf-8');
    console.log(`[HealthFix] Moved ${resource} ${direction} line ${targetIdx} in server.cfg`);
    return true;
  }
}
