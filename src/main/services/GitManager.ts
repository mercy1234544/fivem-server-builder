import simpleGit, { SimpleGit } from 'simple-git';
import fs from 'fs';
import path from 'path';

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
  async cloneRepo(url: string, destination: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!fs.existsSync(destination)) {
        fs.mkdirSync(destination, { recursive: true });
      }
      const git: SimpleGit = simpleGit();
      await git.clone(url, destination);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async pullUpdates(repoPath: string): Promise<{ success: boolean; changes?: number; error?: string }> {
    try {
      const git: SimpleGit = simpleGit(repoPath);
      const result = await git.pull();
      return {
        success: true,
        changes: result.summary.changes,
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async getStatus(repoPath: string): Promise<GitStatus> {
    try {
      const git: SimpleGit = simpleGit(repoPath);
      const status = await git.status();
      const log = await git.log({ maxCount: 1 });

      return {
        isRepo: true,
        currentBranch: status.current || 'unknown',
        behind: status.behind,
        ahead: status.ahead,
        modified: status.modified,
        lastCommit: log.latest?.message || '',
        lastCommitDate: log.latest?.date || '',
      };
    } catch {
      return {
        isRepo: false,
        currentBranch: '',
        behind: 0,
        ahead: 0,
        modified: [],
        lastCommit: '',
        lastCommitDate: '',
      };
    }
  }

  async getLatestRelease(repoUrl: string): Promise<string | null> {
    try {
      const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (!match) return null;

      const [, owner, repo] = match;
      const axios = require('axios');
      const response = await axios.get(
        `https://api.github.com/repos/${owner}/${repo}/releases/latest`
      );
      return response.data.tag_name;
    } catch {
      return null;
    }
  }
}
