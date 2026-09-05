import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { DatasetStore } from '../../composition/ports.js';

/**
 * Adaptador MinIO/S3 (D5, D18).
 *
 * URIs seguem o formato `s3://bucket/key/path` conforme contracts/messaging.md.
 * Upload em streaming — nunca bufferiza o dataset na memória da API (D7).
 */

function parseUri(uri: string): { bucket: string; key: string } {
  // s3://bucket/key/path → { bucket, key }
  const withoutScheme = uri.slice(5); // remove "s3://"
  const slash = withoutScheme.indexOf('/');
  if (slash === -1) throw new Error(`URI inválida: ${uri}`);
  return {
    bucket: withoutScheme.slice(0, slash),
    key: withoutScheme.slice(slash + 1),
  };
}

export class MinioObjectStore implements DatasetStore {
  constructor(private readonly client: S3Client) {}

  async putStream(uri: string, stream: NodeJS.ReadableStream): Promise<void> {
    const { bucket, key } = parseUri(uri);
    await this.client.send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: stream as never }),
    );
  }

  async presignGet(uri: string, expiresInSeconds: number): Promise<string> {
    const { bucket, key } = parseUri(uri);
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  /**
   * Grava marcador `_SUCCESS` após os Parquets (D18).
   * Idempotência do motor verifica este objeto antes de recalcular (D6).
   */
  async writeSuccessMarker(outputPrefix: string): Promise<void> {
    const uri = outputPrefix.endsWith('/') ? `${outputPrefix}_SUCCESS` : `${outputPrefix}/_SUCCESS`;
    const { bucket, key } = parseUri(uri);
    await this.client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: '' }));
  }
}

export function createS3Client(): S3Client {
  const endpoint = process.env.S3_ENDPOINT;
  return new S3Client({
    ...(endpoint !== undefined ? { endpoint } : {}),
    region: process.env.S3_REGION ?? 'us-east-1',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? '',
      secretAccessKey: process.env.S3_SECRET_KEY ?? '',
    },
    forcePathStyle: true, // obrigatório para MinIO
  });
}
