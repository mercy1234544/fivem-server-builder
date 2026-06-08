import fs from 'fs';
import path from 'path';
import axios from 'axios';
import extractZip from 'extract-zip';
import os from 'os';

export interface GitStatus {
  isRepo: boolean;
  currentBranch: string;
  behind: number;
  ahead: number;
  modified: string[];
  lastCommit: string;
  lastCommitDate: string;
}

export class GitManager {
  /**
   * Download a GitHub repo as a ZIP archive and extract it.
   * No git required, no auth prompts, works for all public repos.
   */
  async cloneRepo(url: string, destination: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Parse GitHub URL → owner/repo
      const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (!match) {
        return { success: false, error: 'Not a valid GitHub URL' };
      }
      const [, owner, repo] = match;
      const repoName = repo.replace(/\.git$/, '');

      // Try main branch first, fall back to master
      let zipUrl = `https://github.com/${owner}/${repoName}/archive/refs/heads/main.zip`;
      let response;
      try {
        response = await axios.get(zipUrl, { responseType: 'arraybuffer', timeout: 60000 });
      } catch {
        zipUrl = `https://github.com/${owner}/${repoName}/archive/refs/heads/master.zip`;
        response = await axios.get(zipUrl, { responseType: 'arraybuffer', timeout: 60000 });
      }

      // Write ZIP to temp file
      const tempDir = os.tmpdir();
      const zipPath = path.join(tempDir, `${repoName}-${Date.now()}.zip`);
      fs.writeFileSync(zipPath, Buffer.from(response.data));

      // Extract to a temp folder first
      const extractDir = path.join(tempDir, `${repoName}-extract-${Date.now()}`);
      fs.mkdirSync(extractDir, { recursive: true });
      await extractZip(zipPath, { dir: extractDir });

      // GitHub ZIPs extract to a subfolder like "repo-main/" — find it and move contents to destination
      const extracted = fs.readdirSync(extractDir);
      const innerDir = extracted.length === 1
        ? path.join(extractDir, extracted[0])
        : extractDir;

      // Ensure destination exists
      if (!fs.existsSync(destination)) {
        fs.mkdirSync(destination, { recursive: true });
      }

      // Move all files from inner dir to destination
      this.copyDirRecursive(innerDir, destination);

      // Clean up temp files
      try {
        fs.unlinkSync(zipPath);
        fs.rmSync(extractDir, { recursive: true, force: true });
      } catch {}

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || 'Download failed' };
    }
  }

  private copyDirRecursive(src: string, dest: string) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        this.copyDirRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  async pullUpdates(repoPath: string): Promise<{ success: boolean; changes?: number; error?: string }> {
    // For ZIP-based installs, "pull" means re-download the latest ZIP
    // We detect the repo URL from a .source file we save during install
    try {
      const sourceFile = path.join(repoPath, '.fivem-builder-source');
      if (!fs.existsSync(sourceFile)) {
        return { success: false, error: 'No source URL found — resource was not installed via marketplace' };
      }
      const repoUrl = fs.readFileSync(sourceFile, 'utf-8').trim();

      // Remove old files except .fivem-builder-source
      const entries = fs.readdirSync(repoPath);
      for (const entry of entries) {
        if (entry === '.fivem-builder-source') continue;
        fs.rmSync(path.join(repoPath, entry), { recursive: true, force: true });
      }

      // Re-download
      const result = await this.cloneRepo(repoUrl, repoPath);
      if (result.success) {
        // Re-write the source file
        fs.writeFileSync(sourceFile, repoUrl);
      }
      return { success: result.success, changes: result.success ? 1 : 0, error: result.error };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async getStatus(repoPath: string): Promise<GitStatus> {
    const sourceFile = path.join(repoPath, '.fivem-builder-source');
    return {
      isRepo: fs.existsSync(sourceFile),
      currentBranch: 'main',
      behind: 0,
      ahead: 0,
      modified: [],
      lastCommit: '',
      lastCommitDate: '',
    };
  }

  async getLatestRelease(repoUrl: string): Promise<string | null> {
    try {
      const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (!match) return null;

      const [, owner, repo] = match;
      const response = await axios.get(
        `https://api.github.com/repos/${owner}/${repo}/releases/latest`,
        { timeout: 10000 }
      );
      return response.data.tag_name;
    } catch {
      return null;
    }
  }
}
