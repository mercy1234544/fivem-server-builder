import fs from 'fs';
import path from 'path';

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
  async scanServer(serverPath: string): Promise<HealthReport> {
    const issues: HealthIssue[] = [];

    await this.checkServerCfg(serverPath, issues);
    await this.checkResources(serverPath, issues);
    await this.checkDependencies(serverPath, issues);
    await this.checkDuplicates(serverPath, issues);
    await this.checkStartupOrder(serverPath, issues);

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

    // CFX resources built into the server artifacts — not in resources/
    const builtinResources = new Set([
      'mapmanager', 'chat', 'spawnmanager', 'sessionmanager',
      'hardcap', 'baseevents', 'basic-gamemode', 'fivem',
      'monitor', 'sessionmanager-rdr3', 'webpack', 'yarn',
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
    const ensureOrder: string[] = [];

    for (const line of lines) {
      const match = line.match(/^\s*(?:ensure|start)\s+(\S+)/);
      if (match) ensureOrder.push(match[1]);
    }

    // Check common ordering issues
    const oxlibIndex = ensureOrder.indexOf('ox_lib');
    const oxmysqlIndex = ensureOrder.indexOf('oxmysql');
    const frameworkIndex = Math.max(
      ensureOrder.indexOf('es_extended'),
      ensureOrder.indexOf('qb-core')
    );

    if (oxmysqlIndex > -1 && frameworkIndex > -1 && oxmysqlIndex > frameworkIndex) {
      issues.push({
        id: 'startup-order-mysql',
        severity: 'error',
        category: 'Startup Order',
        message: 'Database (oxmysql) must start before framework',
        suggestion: 'Move oxmysql above your framework in server.cfg',
        autoFixable: true,
      });
    }

    if (oxlibIndex > -1 && frameworkIndex > -1 && oxlibIndex > frameworkIndex) {
      issues.push({
        id: 'startup-order-oxlib',
        severity: 'warning',
        category: 'Startup Order',
        message: 'ox_lib should typically start before framework',
        suggestion: 'Move ox_lib above your framework in server.cfg',
        autoFixable: true,
      });
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

    // Fix startup order — move resource above framework in server.cfg
    if (issue.id === 'startup-order-mysql' || issue.id === 'startup-order-oxlib') {
      if (!fs.existsSync(cfgPath)) return false;
      const content = fs.readFileSync(cfgPath, 'utf-8');
      const lines = content.split('\n');

      const targetResource = issue.id === 'startup-order-mysql' ? 'oxmysql' : 'ox_lib';
      const frameworks = ['es_extended', 'qb-core', 'qbx_core'];

      let targetIdx = -1;
      let frameworkIdx = -1;
      let targetLine = '';

      for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(/^\s*(?:ensure|start)\s+(\S+)/);
        if (!match) continue;
        if (match[1] === targetResource) { targetIdx = i; targetLine = lines[i]; }
        if (frameworks.includes(match[1]) && frameworkIdx === -1) frameworkIdx = i;
      }

      if (targetIdx > -1 && frameworkIdx > -1 && targetIdx > frameworkIdx) {
        lines.splice(targetIdx, 1);
        lines.splice(frameworkIdx, 0, targetLine);
        fs.writeFileSync(cfgPath, lines.join('\n'), 'utf-8');
        return true;
      }
      return false;
    }

    // Fix default license key — remove or comment out the changeme line
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
}
