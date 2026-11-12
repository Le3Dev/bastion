import type { AoVivo } from '../avaliacoes/infraestrutura/ao-vivo';
import type { Armazenamento } from '../integracoes/armazenamento';
import type { Filas } from '../integracoes/filas';
import type { Banco } from './banco/conexao';
import type { Config } from './config';
import type { Relogio } from './relogio';

/** O que a aplicação recebe de fora; os testes injetam falsificações (filas, relógio, banco de teste). */
export interface Dependencias {
  config: Config;
  db: Banco;
  filas: Filas;
  relogio: Relogio;
  /** Relatórios (PDF/JSON) no armazenamento compatível com S3. */
  armazenamento: Armazenamento;
  /** Pub/sub do acompanhamento ao vivo (SSE) das avaliações. */
  aoVivo: AoVivo;
}
