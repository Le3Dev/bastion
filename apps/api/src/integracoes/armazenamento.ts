import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { Config } from '../compartilhado/config';

export interface Armazenamento {
  /** Cria o bucket se ele ainda não existir. */
  garantirBucket(): Promise<void>;
  enviar(chave: string, corpo: Uint8Array | string, tipo: string): Promise<void>;
  obter(chave: string): Promise<Uint8Array>;
  fechar(): void;
}

export const criarArmazenamento = (s3: Config['s3']): Armazenamento => {
  const cliente = new S3Client({
    endpoint: s3.endpoint,
    region: s3.regiao,
    forcePathStyle: true,
    credentials: { accessKeyId: s3.chaveDeAcesso, secretAccessKey: s3.segredo },
  });
  const bucket = s3.bucketDeRelatorios;

  return {
    async garantirBucket() {
      try {
        await cliente.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch {
        await cliente.send(new CreateBucketCommand({ Bucket: bucket }));
      }
    },

    async enviar(chave, corpo, tipo) {
      await cliente.send(
        new PutObjectCommand({ Bucket: bucket, Key: chave, Body: corpo, ContentType: tipo }),
      );
    },

    async obter(chave) {
      const resposta = await cliente.send(new GetObjectCommand({ Bucket: bucket, Key: chave }));
      if (!resposta.Body) throw new Error(`Objeto vazio no armazenamento: ${chave}.`);
      return resposta.Body.transformToByteArray();
    },

    fechar() {
      cliente.destroy();
    },
  };
};
