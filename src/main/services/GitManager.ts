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
      const UA = { 'User-Agent': 'FiveM-Server-Builder' };

      // Resolve the repo's REAL default branch (fixes main-vs-master-vs-other)
      // and detect dead links up front so we can report them clearly.
      const branches: string[] = [];
      try {
        const info = await axios.get(`https://api.github.com/repos/${owner}/${repoName}`, {
          timeout: 15000, headers: { ...UA, Accept: 'application/vnd.github+json' },
        });
        if (info.data?.default_branch) branches.push(info.data.default_branch);
      } catch (e: any) {
        if (e?.response?.status === 404) {
          return { success: false, error: `Repository not found: ${owner}/${repoName}. The download link is out of date, or the script isn't publicly available.` };
        }
        // Rate-limited / offline — fall through to guessing common branches.
      }
      for (const b of ['main', 'master', 'develop']) if (!branches.includes(b)) branches.push(b);

      // Try each candidate branch's archive until one downloads.
      let response: any = null;
      let lastErr = '';
      for (const b of branches) {
        try {
          response = await axios.get(`https://github.com/${owner}/${repoName}/archive/refs/heads/${b}.zip`,
            { responseType: 'arraybuffer', timeout: 60000, headers: UA });
          break;
        } catch (e: any) { lastErr = e?.message || 'download failed'; }
      }

      // Last resort: the latest published release (some repos ship code only there).
      if (!response) {
        try {
          const rel = await axios.get(`https://api.github.com/repos/${owner}/${repoName}/releases/latest`,
            { timeout: 15000, headers: UA });
          if (rel.data?.zipball_url) {
            response = await axios.get(rel.data.zipball_url, { responseType: 'arraybuffer', timeout: 60000, headers: UA });
          }
        } catch { /* no release either */ }
      }

      if (!response) {
        return { success: false, error: `Could not download ${owner}/${repoName} — ${lastErr || 'no installable branch or release found'}.` };
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
