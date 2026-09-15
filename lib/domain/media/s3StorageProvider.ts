import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageProvider } from './types';

export class S3StorageProvider implements StorageProvider {
  id = 's3-storage-provider';
  name = 'S3/MinIO-Compatible Storage Adapter';

  private client: S3Client | null = null;
  private bucket: string;

  constructor() {
    this.bucket = process.env.CMS_STORAGE_BUCKET || 'synthesis-cms-dev';
  }

  private getClient(): S3Client {
    if (!this.client) {
      const endpoint = process.env.CMS_STORAGE_ENDPOINT; // e.g. http://synthesis_cms_dev_storage:9000
      const region = process.env.CMS_STORAGE_REGION || 'us-east-1';
      const accessKeyId = process.env.CMS_STORAGE_ACCESS_KEY;
      const secretAccessKey = process.env.CMS_STORAGE_SECRET_KEY;

      if (!accessKeyId || !secretAccessKey) {
        throw new Error('CMS_STORAGE_ACCESS_KEY and CMS_STORAGE_SECRET_KEY are required for S3StorageProvider');
      }

      this.client = new S3Client({
        region,
        endpoint,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
        forcePathStyle: !!endpoint, // Force path style for local MinIO
      });
    }
    return this.client;
  }

  async upload(
    file: { name: string; type: string; size: number; data?: Blob | ArrayBuffer | Buffer },
    storageKey: string
  ): Promise<{ storageKey: string; sizeBytes: number }> {
    const s3 = this.getClient();
    let body: Buffer;

    if (file.data instanceof Buffer) {
      body = file.data;
    } else if (file.data instanceof ArrayBuffer) {
      body = Buffer.from(file.data);
    } else if (file.data instanceof Blob) {
      const arrayBuffer = await file.data.arrayBuffer();
      body = Buffer.from(arrayBuffer);
    } else if (typeof file.data === 'string') {
      body = Buffer.from(file.data);
    } else {
      throw new Error('Unsupported upload file data format');
    }

    await s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Body: body,
        ContentType: file.type,
      })
    );

    return {
      storageKey,
      sizeBytes: file.size,
    };
  }

  async delete(storageKey: string): Promise<void> {
    const s3 = this.getClient();
    await s3.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
      })
    );
  }

  async putObject(
    key: string,
    data: Buffer | Uint8Array | Blob,
    options: { mimeType: string; sizeBytes: number; checksumSha256: string }
  ): Promise<void> {
    const s3 = this.getClient();
    let body: Buffer;

    if (data instanceof Buffer) {
      body = data;
    } else if (data instanceof Uint8Array) {
      body = Buffer.from(data);
    } else if (data instanceof Blob) {
      const arrayBuffer = await data.arrayBuffer();
      body = Buffer.from(arrayBuffer);
    } else {
      body = Buffer.from(data as any);
    }

    await s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: options.mimeType,
        Metadata: {
          checksumSha256: options.checksumSha256,
        },
      })
    );
  }

  async getObject(key: string): Promise<{ data: Buffer | Uint8Array | Blob; mimeType: string; sizeBytes: number }> {
    const s3 = this.getClient();
    const result = await s3.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );

    if (!result.Body) {
      throw new Error(`Object not found or empty: ${key}`);
    }

    const bytes = await result.Body.transformToByteArray();
    const buffer = Buffer.from(bytes);

    return {
      data: buffer,
      mimeType: result.ContentType || 'application/octet-stream',
      sizeBytes: result.ContentLength || buffer.length,
    };
  }

  async deleteObject(key: string): Promise<void> {
    await this.delete(key);
  }

  async getSignedReadUrl(key: string, expirySeconds?: number): Promise<string> {
    const s3 = this.getClient();
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(s3, command, { expiresIn: expirySeconds || 900 });
  }

  async exists(key: string): Promise<boolean> {
    const s3 = this.getClient();
    try {
      await s3.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }
}
