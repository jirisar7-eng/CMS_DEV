import net from 'net';
import crypto from 'crypto';
import { MalwareScanner, MalwareScanResult } from './types';

export interface ClamAvScannerOptions {
  host?: string;
  port?: number;
  timeoutMs?: number;
}

export class ClamAvMalwareScanner implements MalwareScanner {
  id = 'clamav';
  name = 'ClamAV Network Malware Scanner';

  private host?: string;
  private port?: number;
  private timeoutMs: number;

  constructor(opts?: ClamAvScannerOptions) {
    this.host = opts?.host || process.env.CMS_CLAMAV_HOST;
    const envPort = process.env.CMS_CLAMAV_PORT;
    this.port = opts?.port ? opts.port : (envPort ? parseInt(envPort, 10) : undefined);
    const envTimeout = process.env.CMS_CLAMAV_TIMEOUT_MS;
    this.timeoutMs = opts?.timeoutMs ? opts.timeoutMs : (envTimeout ? parseInt(envTimeout, 10) : 5000);
  }

  async scan(file: { name: string; type: string; size: number; data?: Buffer | Uint8Array | Blob | ArrayBuffer }): Promise<MalwareScanResult> {
    const scannedAt = new Date().toISOString();

    const host = this.host || process.env.CMS_CLAMAV_HOST;
    const rawPort = this.port || process.env.CMS_CLAMAV_PORT;
    const port = typeof rawPort === 'number' ? rawPort : (rawPort ? parseInt(rawPort, 10) : undefined);

    if (!host || !port || isNaN(port)) {
      return {
        clean: false,
        status: 'CONFIGURATION_MISSING',
        reasonCode: 'CONFIGURATION_MISSING',
        scannedAt,
        scannerId: this.id,
      };
    }

    let buffer: Buffer;
    try {
      buffer = await this.toBuffer(file.data);
    } catch {
      return {
        clean: false,
        status: 'MALFORMED_RESPONSE',
        reasonCode: 'INVALID_FILE_DATA',
        scannedAt,
        scannerId: this.id,
      };
    }

    const checksumSha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    try {
      const scanOutput = await this.sendInstream(host, port, buffer, this.timeoutMs);
      return this.parseClamResponse(scanOutput, scannedAt, checksumSha256);
    } catch (err: any) {
      const code = err?.code || err?.message;
      if (code === 'SCAN_TIMEOUT' || code === 'ETIMEDOUT') {
        return {
          clean: false,
          status: 'TIMEOUT',
          reasonCode: 'SCAN_TIMEOUT',
          scannedAt,
          scannerId: this.id,
          checksumSha256,
        };
      }
      if (code === 'MALFORMED_RESPONSE') {
        return {
          clean: false,
          status: 'MALFORMED_RESPONSE',
          reasonCode: 'MALFORMED_RESPONSE',
          scannedAt,
          scannerId: this.id,
          checksumSha256,
        };
      }
      return {
        clean: false,
        status: 'CONNECTION_FAILED',
        reasonCode: 'CONNECTION_FAILED',
        scannedAt,
        scannerId: this.id,
        checksumSha256,
      };
    }
  }

  private async toBuffer(data?: Buffer | Uint8Array | Blob | ArrayBuffer): Promise<Buffer> {
    if (!data) return Buffer.alloc(0);
    if (Buffer.isBuffer(data)) return data;
    if (data instanceof Uint8Array) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    if (data instanceof ArrayBuffer) return Buffer.from(data);
    if (typeof Blob !== 'undefined' && data instanceof Blob) {
      const arrayBuffer = await data.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }
    return Buffer.alloc(0);
  }

  private sendInstream(host: string, port: number, buffer: Buffer, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      let responseData = '';
      let isSettled = false;

      const timer = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          socket.destroy();
          const err = new Error('SCAN_TIMEOUT');
          (err as any).code = 'SCAN_TIMEOUT';
          reject(err);
        }
      }, timeoutMs);

      socket.setTimeout(timeoutMs);

      socket.on('timeout', () => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timer);
          socket.destroy();
          const err = new Error('SCAN_TIMEOUT');
          (err as any).code = 'SCAN_TIMEOUT';
          reject(err);
        }
      });

      socket.on('error', (err) => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timer);
          socket.destroy();
          reject(err);
        }
      });

      socket.on('data', (chunk) => {
        responseData += chunk.toString('utf8');
      });

      socket.on('end', () => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timer);
          resolve(responseData);
        }
      });

      socket.on('close', () => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timer);
          resolve(responseData);
        }
      });

      socket.connect(port, host, () => {
        try {
          // clamd command: zINSTREAM\0
          socket.write('zINSTREAM\0');

          const chunkSize = 64 * 1024;
          for (let offset = 0; offset < buffer.length; offset += chunkSize) {
            const chunk = buffer.subarray(offset, offset + chunkSize);
            const header = Buffer.alloc(4);
            header.writeUInt32BE(chunk.length, 0);
            socket.write(header);
            socket.write(chunk);
          }

          const zeroHeader = Buffer.alloc(4);
          zeroHeader.writeUInt32BE(0, 0);
          socket.write(zeroHeader);
        } catch (writeErr) {
          if (!isSettled) {
            isSettled = true;
            clearTimeout(timer);
            socket.destroy();
            reject(writeErr);
          }
        }
      });
    });
  }

  private parseClamResponse(rawResponse: string, scannedAt: string, checksumSha256: string): MalwareScanResult {
    const trimmed = rawResponse.replace(/[\r\n\0]+/g, ' ').trim();
    if (!trimmed) {
      return {
        clean: false,
        status: 'MALFORMED_RESPONSE',
        reasonCode: 'MALFORMED_RESPONSE',
        scannedAt,
        scannerId: this.id,
        checksumSha256,
      };
    }

    if (trimmed.endsWith(' OK') || trimmed === 'OK' || /\bOK$/i.test(trimmed)) {
      return {
        clean: true,
        status: 'CLEAN',
        scannedAt,
        scannerId: this.id,
        checksumSha256,
      };
    }

    if (/\bFOUND\b/i.test(trimmed)) {
      const match = trimmed.match(/stream:\s*(.+?)\s*FOUND/i) || trimmed.match(/:\s*(.+?)\s*FOUND/i) || trimmed.match(/(.+?)\s*FOUND/i);
      const threat = match ? match[1].trim() : 'VIRUS_FOUND';
      return {
        clean: false,
        status: 'INFECTED',
        threat,
        reasonCode: 'VIRUS_FOUND',
        scannedAt,
        scannerId: this.id,
        checksumSha256,
      };
    }

    if (/\bERROR\b/i.test(trimmed) || trimmed.includes('exceeded')) {
      return {
        clean: false,
        status: 'MALFORMED_RESPONSE',
        reasonCode: 'SCANNER_ERROR',
        scannedAt,
        scannerId: this.id,
        checksumSha256,
      };
    }

    return {
      clean: false,
      status: 'MALFORMED_RESPONSE',
      reasonCode: 'MALFORMED_RESPONSE',
      scannedAt,
      scannerId: this.id,
      checksumSha256,
    };
  }
}
