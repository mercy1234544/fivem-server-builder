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

    if (content.includes('changeme') || content.includes('change_me')) {
      issues.push({
        id: 'default-license-key',
        severity: 'error',
        category: 'Configuration',
        message: 'License key has not been set',
        file: cfgPath,
        suggestion: 'Set your FiveM license key from keymaster.fivem.net',
        autoFixable: false,
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
    const singlePattern = new RegExp(`${directive}s?\\s+['"]([^'"]+)['"]`, 'g');
    const blockPattern = new RegExp(`${directive}s?\\s*\\{([^}]+)\\}`, 'g');

    let match;
    while ((match = singlePattern.exec(content)) !== null) {
      paths.push(match[1]);
    }
    while ((match = blockPattern.exec(content)) !== null) {
      const blockContent = match[1];
      const items = blockContent.matchAll(/['"]([^'"]+)['"]/g);
      for (const item of items) {
        paths.push(item[1]);
      }
    }
    return paths;
  }

  private async checkDependencies(serverPath: string, issues: HealthIssue[]) {
    const cfgPath = path.join(serverPath, 'server.cfg');
    if (!fs.existsSync(cfgPath)) return;

    const cfg = fs.readFileSync(cfgPath, 'utf-8');
    const ensuredResources = new Set<string>();
    const ensurePattern = /(?:ensure|start)\s+(\S+)/g;
    let match;
    while ((match = ensurePattern.exec(cfg)) !== null) {
      ensuredResources.add(match[1]);
    }

    // Check if ensured resources actually exist
    const resourcesPath = path.join(serverPath, 'resources');
    if (!fs.existsSync(resourcesPath)) return;

    for (const resourceName of ensuredResources) {
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

    switch (issue.id) {
      case 'missing-endpoints': {
        let content = fs.readFileSync(cfgPath, 'utf-8');
        content += '\nendpoint_add_tcp "0.0.0.0:30120"\nendpoint_add_udp "0.0.0.0:30120"\n';
        fs.writeFileSync(cfgPath, content);
        return true;
      }
      case 'onesync-not-set': {
        let content = fs.readFileSync(cfgPath, 'utf-8');
        content += '\nset onesync on\n';
        fs.writeFileSync(cfgPath, content);
        return true;
      }
      case 'missing-resources-dir': {
        fs.mkdirSync(path.join(serverPath, 'resources'), { recursive: true });
        return true;
      }
      default:
        return false;
    }
  }
}
