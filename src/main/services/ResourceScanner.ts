import fs from 'fs';
import path from 'path';

export interface Resource {
  name: string;
  path: string;
  version: string | null;
  author: string | null;
  description: string | null;
  dependencies: string[];
  enabled: boolean;
  category: string;
  hasManifest: boolean;
  manifestType: 'fxmanifest' | '__resource' | 'none';
  issues: string[];
}

const VENDOR_PREFIXES = ['jg-', 'jg_', 'tstudio-', 'tstudio_', 'ts-', 'ts_'];

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  '[core]': ['oxmysql', 'ox_lib', 'mysql-async', 'ghmatti', 'framework'],
  '[framework]': ['es_extended', 'esx_', 'qb-core', 'qb-', 'ND_Core'],
  '[jobs]': ['job', 'mechanic', 'taxi', 'trucker', 'mining', 'fishing', 'hunting'],
  '[police]': ['police', 'mdt', 'dispatch', 'jail', 'prison', 'court'],
  '[ems]': ['ems', 'ambulance', 'hospital', 'medic', 'doctor'],
  '[vehicles]': ['vehicle', 'garage', 'car', 'dealership', 'fuel', 'mechanic'],
  '[housing]': ['housing', 'property', 'apartment', 'house', 'realestate', 'shell'],
  '[admin]': ['admin', 'txadmin', 'vMenu', 'permission'],
  '[voice]': ['voice', 'pma-voice', 'mumble', 'tokovoip', 'saltychat'],
  '[maps]': ['map', 'mlo', 'ymap', 'interior'],
  '[standalone]': ['standalone'],
};

export class ResourceScanner {
  async scanResources(serverPath: string): Promise<Resource[]> {
    const resourcesPath = path.join(serverPath, 'resources');
    if (!fs.existsSync(resourcesPath)) {
      return [];
    }

    const resources: Resource[] = [];
    await this.scanDirectory(resourcesPath, resources, serverPath);
    return resources;
  }

  private async scanDirectory(dir: string, resources: Resource[], serverPath: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const fullPath = path.join(dir, entry.name);
      const fxManifest = path.join(fullPath, 'fxmanifest.lua');
      const oldManifest = path.join(fullPath, '__resource.lua');

      if (fs.existsSync(fxManifest) || fs.existsSync(oldManifest)) {
        const resource = await this.parseResource(fullPath, entry.name, serverPath);
        resources.push(resource);
      } else {
        await this.scanDirectory(fullPath, resources, serverPath);
      }
    }
  }

  private async parseResource(resourcePath: string, name: string, serverPath: string): Promise<Resource> {
    const fxManifestPath = path.join(resourcePath, 'fxmanifest.lua');
    const oldManifestPath = path.join(resourcePath, '__resource.lua');
    const hasFxManifest = fs.existsSync(fxManifestPath);
    const hasOldManifest = fs.existsSync(oldManifestPath);

    let manifestContent = '';
    let manifestType: 'fxmanifest' | '__resource' | 'none' = 'none';

    if (hasFxManifest) {
      manifestContent = fs.readFileSync(fxManifestPath, 'utf-8');
      manifestType = 'fxmanifest';
    } else if (hasOldManifest) {
      manifestContent = fs.readFileSync(oldManifestPath, 'utf-8');
      manifestType = '__resource';
    }

    const version = this.extractField(manifestContent, 'version');
    const author = this.extractField(manifestContent, 'author');
    const description = this.extractField(manifestContent, 'description');
    const dependencies = this.extractDependencies(manifestContent);
    const issues = this.detectIssues(resourcePath, manifestContent, manifestType);

    const serverCfgPath = path.join(serverPath, 'server.cfg');
    let enabled = true;
    if (fs.existsSync(serverCfgPath)) {
      const cfg = fs.readFileSync(serverCfgPath, 'utf-8');
      enabled = cfg.includes(`ensure ${name}`) || cfg.includes(`start ${name}`);
    }

    const category = this.detectCategory(name, manifestContent);

    return {
      name,
      path: resourcePath,
      version,
      author,
      description,
      dependencies,
      enabled,
      category,
      hasManifest: hasFxManifest || hasOldManifest,
      manifestType,
      issues,
    };
  }

  private extractField(content: string, field: string): string | null {
    const patterns = [
      new RegExp(`${field}\\s+['"]([^'"]+)['"]`),
      new RegExp(`${field}\\s*\\(\\s*['"]([^'"]+)['"]\\s*\\)`),
    ];
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  private extractDependencies(content: string): string[] {
    const deps: string[] = [];
    const patterns = [
      /dependencies\s*\{([^}]+)\}/g,
      /dependency\s+['"]([^'"]+)['"]/g,
    ];

    const blockMatch = content.match(/dependencies\s*\{([^}]+)\}/);
    if (blockMatch) {
      const matches = blockMatch[1].matchAll(/['"]([^'"]+)['"]/g);
      for (const m of matches) {
        deps.push(m[1]);
      }
    }

    const singleMatch = content.matchAll(/dependency\s+['"]([^'"]+)['"]/g);
    for (const m of singleMatch) {
      deps.push(m[1]);
    }

    return [...new Set(deps)];
  }

  private detectIssues(resourcePath: string, content: string, manifestType: string): string[] {
    const issues: string[] = [];

    if (manifestType === 'none') {
      issues.push('No manifest file found');
    }

    if (manifestType === '__resource') {
      issues.push('Using deprecated __resource.lua - consider migrating to fxmanifest.lua');
    }

    if (content && !content.includes('fx_version')) {
      if (manifestType === 'fxmanifest') {
        issues.push('Missing fx_version in fxmanifest.lua');
      }
    }

    if (content && !content.includes('game')) {
      if (manifestType === 'fxmanifest') {
        issues.push('Missing game directive in fxmanifest.lua');
      }
    }

    return issues;
  }

  private detectCategory(name: string, content: string): string {
    const lowerName = name.toLowerCase();
    const lowerContent = content.toLowerCase();

    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      for (const keyword of keywords) {
        if (lowerName.includes(keyword) || lowerContent.includes(keyword)) {
          return category;
        }
      }
    }

    return '[custom]';
  }

  async getResourceInfo(resourcePath: string): Promise<Resource | null> {
    const name = path.basename(resourcePath);
    if (!fs.existsSync(resourcePath)) return null;
    return this.parseResource(resourcePath, name, path.dirname(path.dirname(resourcePath)));
  }

  async toggleResource(serverPath: string, resourceName: string, enabled: boolean): Promise<boolean> {
    const cfgPath = path.join(serverPath, 'server.cfg');
    if (!fs.existsSync(cfgPath)) return false;

    let content = fs.readFileSync(cfgPath, 'utf-8');

    if (enabled) {
      if (!content.includes(`ensure ${resourceName}`)) {
        content += `\nensure ${resourceName}`;
      }
    } else {
      content = content.replace(new RegExp(`^\\s*(ensure|start)\\s+${resourceName}\\s*$`, 'gm'), '');
    }

    fs.writeFileSync(cfgPath, content);
    return true;
  }

  isVendorResource(name: string): boolean {
    return VENDOR_PREFIXES.some(prefix => name.toLowerCase().startsWith(prefix));
  }

  async categorizeResources(resources: Resource[]): Promise<Record<string, Resource[]>> {
    const categories: Record<string, Resource[]> = {};
    for (const resource of resources) {
      if (!categories[resource.category]) {
        categories[resource.category] = [];
      }
      categories[resource.category].push(resource);
    }
    return categories;
  }
}
