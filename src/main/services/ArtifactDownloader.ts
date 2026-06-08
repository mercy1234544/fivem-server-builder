import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { EventEmitter } from 'events';
import extractZip from 'extract-zip';

export interface ArtifactVersion {
  version: string;
  url: string;
  recommended: boolean;
  experimental: boolean;
}

export interface DownloadProgress {
  percent: number;
  downloaded: number;
  total: number;
  speed: number;
}

export class ArtifactDownloader extends EventEmitter {
  private readonly BASE_URL = 'https://runtime.fivem.net/artifacts/fivem/build_server_windows/master/';

  async getAvailableVersions(): Promise<ArtifactVersion[]> {
    // Return known stable versions - in production this would scrape the artifacts page
    return [
      {
        version: '7290-latest-recommended',
        url: `${this.BASE_URL}7290-a]78f234abc/server.zip`,
        recommended: true,
        experimental: false,
      },
      {
        version: '7290-latest-experimental',
        url: `${this.BASE_URL}7290-a78f234abc/server.zip`,
        recommended: false,
        experimental: true,
      },
    ];
  }

  async download(version: string, destination: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!fs.existsSync(destination)) {
        fs.mkdirSync(destination, { recursive: true });
      }

      const tempFile = path.join(destination, 'server-artifact.zip');

      // Construct download URL based on version
      const url = this.getDownloadUrl(version);

      await this.downloadFile(url, tempFile);

      // Extract
      await extractZip(tempFile, { dir: destination });

      // Clean up temp file
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private getDownloadUrl(version: string): string {
    if (version.startsWith('http')) return version;
    return `${this.BASE_URL}${version}/server.zip`;
  }

  private downloadFile(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(dest);
      const protocol = url.startsWith('https') ? https : http;

      protocol.get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            file.close();
            fs.unlinkSync(dest);
            this.downloadFile(redirectUrl, dest).then(resolve).catch(reject);
            return;
          }
        }

        const totalSize = parseInt(response.headers['content-length'] || '0', 10);
        let downloaded = 0;
        let lastTime = Date.now();
        let lastDownloaded = 0;

        response.on('data', (chunk: Buffer) => {
          downloaded += chunk.length;
          const now = Date.now();
          const elapsed = (now - lastTime) / 1000;

          if (elapsed >= 0.5) {
            const speed = (downloaded - lastDownloaded) / elapsed;
            this.emit('progress', {
              percent: totalSize > 0 ? (downloaded / totalSize) * 100 : 0,
              downloaded,
              total: totalSize,
              speed,
            });
            lastTime = now;
            lastDownloaded = downloaded;
          }
        });

        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      }).on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    });
  }
}
