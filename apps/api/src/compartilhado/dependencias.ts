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
}
