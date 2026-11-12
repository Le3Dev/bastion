// Reexporta o relógio para que os casos de uso o recebam por injeção (testes usam um relógio fixo).
export { relogioDoSistema, type Relogio } from '@bastion/dominio-compartilhado';
