import fs from 'fs';
import path from 'path';

export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  modified: string;
  extension: string;
}

export class FileManager {
  async readDirectory(dirPath: string): Promise<FileEntry[]> {
    if (!fs.existsSync(dirPath)) return [];

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const results: FileEntry[] = [];

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      try {
        const stats = fs.statSync(fullPath);
        results.push({
          name: entry.name,
          path: fullPath,
          type: entry.isDirectory() ? 'directory' : 'file',
          size: stats.size,
          modified: stats.mtime.toISOString(),
          extension: entry.isDirectory() ? '' : path.extname(entry.name),
        });
      } catch {}
    }

    return results.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  async readFile(filePath: string): Promise<{ content: string; encoding: string } | null> {
    if (!fs.existsSync(filePath)) return null;

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return { content, encoding: 'utf-8' };
    } catch {
      return null;
    }
  }

  async writeFile(filePath: string, content: string): Promise<boolean> {
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, content, 'utf-8');
      return true;
    } catch {
      return false;
    }
  }

  async rename(oldPath: string, newPath: string): Promise<boolean> {
    try {
      fs.renameSync(oldPath, newPath);
      return true;
    } catch {
      return false;
    }
  }

  async createDirectory(dirPath: string): Promise<boolean> {
    try {
      fs.mkdirSync(dirPath, { recursive: true });
      return true;
    } catch {
      return false;
    }
  }

  async delete(targetPath: string): Promise<boolean> {
    try {
      const stats = fs.statSync(targetPath);
      if (stats.isDirectory()) {
        fs.rmSync(targetPath, { recursive: true });
      } else {
        fs.unlinkSync(targetPath);
      }
      return true;
    } catch {
      return false;
    }
  }

  async exists(targetPath: string): Promise<boolean> {
    return fs.existsSync(targetPath);
  }

  async search(dir: string, query: string): Promise<FileEntry[]> {
    const results: FileEntry[] = [];
    const lowerQuery = query.toLowerCase();
    this.searchRecursive(dir, lowerQuery, results, 0);
    return results;
  }

  private searchRecursive(dir: string, query: string, results: FileEntry[], depth: number) {
    if (depth > 5 || results.length > 100) return;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.toLowerCase().includes(query)) {
          const fullPath = path.join(dir, entry.name);
          const stats = fs.statSync(fullPath);
          results.push({
            name: entry.name,
            path: fullPath,
            type: entry.isDirectory() ? 'directory' : 'file',
            size: stats.size,
            modified: stats.mtime.toISOString(),
            extension: entry.isDirectory() ? '' : path.extname(entry.name),
          });
        }
        if (entry.isDirectory()) {
          this.searchRecursive(path.join(dir, entry.name), query, results, depth + 1);
        }
      }
    } catch {}
  }
}
