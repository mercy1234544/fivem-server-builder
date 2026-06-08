import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import extractZip from 'extract-zip';
import axios from 'axios';

export interface ArtifactVersion {
  version: string;
  url: string;
  recommended: boolean;
  txAdminVersion?: string;
}

export interface DownloadProgress {
  percent: number;
  downloaded: number;
  total: number;
  speed: number;
  message?: string;
}

export class ArtifactDownloader extends EventEmitter {
  private readonly VERSIONS_API = 'https://changelogs-live.fivem.net/api/changelog/versions/win32/server';

  /**
   * Fetch available artifact versions from FiveM's official API.
   * Returns full download URLs with hashes.
   */
  async getAvailableVersions(): Promise<ArtifactVersion[]> {
    const versions: ArtifactVersion[] = [];

    try {
      const response = await axios.get(this.VERSIONS_API, { timeout: 15000 });
      const data = response.data;

      // Recommended build (stable)
      if (data.recommended_download) {
        versions.push({
          version: data.recommended,
          url: data.recommended_download,
          recommended: true,
          txAdminVersion: data.recommended_txadmin,
        });
      }

      // Latest build (bleeding edge)
      if (data.latest_download && data.latest !== data.recommended) {
        versions.push({
          version: data.latest,
          url: data.latest_download,
          recommended: false,
          txAdminVersion: data.latest_txadmin,
        });
      }

      // Critical/optional build
      if (data.optional_download && data.optional !== data.recommended && data.optional !== data.latest) {
        versions.push({
          version: data.optional,
          url: data.optional_download,
          recommended: false,
          txAdminVersion: data.optional_txadmin,
        });
      }
    } catch (err) {
      console.error('Failed to fetch artifact versions:', err);
    }

    return versions;
  }

  /**
   * Download and extract FiveM server artifacts to destination.
   * This gives you FXServer.exe, cache/, citizen/, txAdmin, and all server binaries.
   */
  async download(version: string, destination: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!fs.existsSync(destination)) {
        fs.mkdirSync(destination, { recursive: true });
      }

      // Resolve the download URL
      let url: string;

      if (version.startsWith('http')) {
        // Direct URL passed
        url = version;
      } else {
        // Fetch versions from API and pick the right one
        this.emit('progress', { percent: 0, downloaded: 0, total: 0, speed: 0, message: 'Fetching latest artifact version...' });

        const versions = await this.getAvailableVersions();

        if (version === 'recommended' || version === 'latest-recommended') {
          const target = versions.find(v => v.recommended);
          if (!target) {
            return { success: false, error: 'Could not find recommended artifact version from FiveM API' };
          }
          url = target.url;
          console.log(`Using recommended artifacts: build ${target.version} (txAdmin ${target.txAdminVersion})`);
        } else if (version === 'experimental' || version === 'latest-experimental') {
          const target = versions.find(v => !v.recommended) || versions[0];
          if (!target) {
            return { success: false, error: 'Could not find experimental artifact version from FiveM API' };
          }
          url = target.url;
          console.log(`Using experimental artifacts: build ${target.version} (txAdmin ${target.txAdminVersion})`);
        } else {
          // Try to find by version number
          const target = versions.find(v => v.version === version);
          if (target) {
            url = target.url;
          } else {
            return { success: false, error: `Artifact version "${version}" not found. Available: ${versions.map(v => v.version).join(', ')}` };
          }
        }
      }

      console.log(`Downloading FiveM artifacts from: ${url}`);
      this.emit('progress', { percent: 1, downloaded: 0, total: 0, speed: 0, message: 'Starting artifact download...' });

      const tempFile = path.join(destination, 'server-artifact.zip');

      // Download with progress tracking
      await this.downloadWithProgress(url, tempFile);

      // Extract
      this.emit('progress', { percent: 90, downloaded: 0, total: 0, speed: 0, message: 'Extracting server files (FXServer.exe, txAdmin, cache, citizen)...' });
      console.log('Extracting artifacts...');
      await extractZip(tempFile, { dir: destination });

      // Clean up temp zip
      try { fs.unlinkSync(tempFile); } catch {}

      // Verify key files exist
      const hasServer = fs.existsSync(path.join(destination, 'FXServer.exe'));
      console.log(`Extraction complete. FXServer.exe present: ${hasServer}`);

      this.emit('progress', { percent: 100, downloaded: 0, total: 0, speed: 0, message: 'Artifacts installed successfully!' });

      return { success: true };
    } catch (error: any) {
      console.error('Artifact download error:', error);
      return { success: false, error: error.message };
    }
  }

  private async downloadWithProgress(url: string, dest: string): Promise<void> {
    const response = await axios({
      method: 'GET',
      url,
      responseType: 'stream',
      timeout: 600000, // 10 minute timeout for large artifact downloads
      maxRedirects: 10,
    });

    const totalSize = parseInt(String(response.headers['content-length'] || '0'), 10);
    let downloaded = 0;
    let lastTime = Date.now();
    let lastDownloaded = 0;

    const writer = fs.createWriteStream(dest);

    return new Promise((resolve, reject) => {
      response.data.on('data', (chunk: Buffer) => {
        downloaded += chunk.length;
        const now = Date.now();
        const elapsed = (now - lastTime) / 1000;

        if (elapsed >= 0.5) {
          const speed = (downloaded - lastDownloaded) / elapsed;
          const percent = totalSize > 0 ? (downloaded / totalSize) * 85 : 0; // Cap at 85% — extraction is last 15%
          this.emit('progress', {
            percent,
            downloaded,
            total: totalSize,
            speed,
            message: `Downloading artifacts: ${this.formatBytes(downloaded)} / ${this.formatBytes(totalSize)} (${this.formatBytes(speed)}/s)`,
          });
          lastTime = now;
          lastDownloaded = downloaded;
        }
      });

      response.data.pipe(writer);

      writer.on('finish', () => {
        writer.close();
        resolve();
      });

      writer.on('error', (err: Error) => {
        fs.unlink(dest, () => {});
        reject(err);
      });

      response.data.on('error', (err: Error) => {
        writer.close();
        fs.unlink(dest, () => {});
        reject(err);
      });
    });
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  }
}
