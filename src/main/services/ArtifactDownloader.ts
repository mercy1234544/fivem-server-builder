import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import extractZip from 'extract-zip';
import axios from 'axios';

export interface ArtifactVersion {
  version: string;
  url: string;
  recommended: boolean;
}

export interface DownloadProgress {
  percent: number;
  downloaded: number;
  total: number;
  speed: number;
}

export class ArtifactDownloader extends EventEmitter {
  // Official FiveM artifact URLs
  private readonly ARTIFACTS_PAGE = 'https://runtime.fivem.net/artifacts/fivem/build_server_windows/master/';
  private readonly RECOMMENDED_URL = 'https://changelogs-live.fivem.net/api/changelog/versions/win32/server';

  /**
   * Fetch available artifact versions from the FiveM CDN.
   * Gets the recommended build number from the official API.
   */
  async getAvailableVersions(): Promise<ArtifactVersion[]> {
    const versions: ArtifactVersion[] = [];

    try {
      // Get the recommended version from FiveM's API
      const response = await axios.get(this.RECOMMENDED_URL, { timeout: 15000 });
      const recommended = response.data?.recommended;
      const latest = response.data?.latest;
      const critical = response.data?.critical;

      if (recommended) {
        versions.push({
          version: recommended,
          url: `${this.ARTIFACTS_PAGE}${recommended}/server.zip`,
          recommended: true,
        });
      }

      if (latest && latest !== recommended) {
        versions.push({
          version: latest,
          url: `${this.ARTIFACTS_PAGE}${latest}/server.zip`,
          recommended: false,
        });
      }

      if (critical && critical !== recommended && critical !== latest) {
        versions.push({
          version: critical,
          url: `${this.ARTIFACTS_PAGE}${critical}/server.zip`,
          recommended: false,
        });
      }
    } catch (err) {
      console.error('Failed to fetch artifact versions:', err);
      // Fallback: try scraping the artifacts page for build links
      try {
        const pageResponse = await axios.get(this.ARTIFACTS_PAGE, { timeout: 15000 });
        const html = pageResponse.data as string;
        // Extract build links like "7290-abcdef123456/"
        const buildPattern = /href="(\d+-[a-f0-9]+)\//g;
        let match;
        const builds: string[] = [];
        while ((match = buildPattern.exec(html)) !== null && builds.length < 5) {
          builds.push(match[1]);
        }
        // The last entry on the page is typically the latest
        if (builds.length > 0) {
          const latestBuild = builds[builds.length - 1];
          versions.push({
            version: latestBuild,
            url: `${this.ARTIFACTS_PAGE}${latestBuild}/server.zip`,
            recommended: true,
          });
        }
      } catch {}
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

      // Get the download URL
      let url: string;
      if (version.startsWith('http')) {
        url = version;
      } else if (version === 'recommended' || version === 'latest') {
        // Fetch the recommended version
        const versions = await this.getAvailableVersions();
        const target = versions.find(v => v.recommended) || versions[0];
        if (!target) {
          return { success: false, error: 'Could not find any artifact versions' };
        }
        url = target.url;
        console.log(`Downloading ${target.version} artifacts from: ${url}`);
      } else {
        // Assume it's a build number/hash
        url = `${this.ARTIFACTS_PAGE}${version}/server.zip`;
      }

      const tempFile = path.join(destination, 'server-artifact.zip');

      // Download with progress
      await this.downloadWithProgress(url, tempFile);

      this.emit('progress', { percent: 90, downloaded: 0, total: 0, speed: 0, message: 'Extracting artifacts...' });

      // Extract
      await extractZip(tempFile, { dir: destination });

      // Clean up temp zip
      try { fs.unlinkSync(tempFile); } catch {}

      this.emit('progress', { percent: 100, downloaded: 0, total: 0, speed: 0, message: 'Artifacts installed' });

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async downloadWithProgress(url: string, dest: string): Promise<void> {
    // Use axios for the initial request to handle redirects properly
    const response = await axios({
      method: 'GET',
      url,
      responseType: 'stream',
      timeout: 300000, // 5 minute timeout for large downloads
      maxRedirects: 5,
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

        if (elapsed >= 0.3) {
          const speed = (downloaded - lastDownloaded) / elapsed;
          const percent = totalSize > 0 ? (downloaded / totalSize) * 85 : 0; // Cap at 85%, extraction is the last 15%
          this.emit('progress', {
            percent,
            downloaded,
            total: totalSize,
            speed,
            message: `Downloading artifacts: ${this.formatBytes(downloaded)} / ${this.formatBytes(totalSize)}`,
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
