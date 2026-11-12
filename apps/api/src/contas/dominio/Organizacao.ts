import {
  criarEvento,
  Email,
  ErroDeDominio,
  type Papel,
} from '@bastion/dominio-compartilhado';
import type { EventoDeOrganizacao } from './eventos';
import { Membro, type DadosDoMembro } from './Membro';
import { exigirPermissao } from './Permissoes';

export interface DadosDaOrganizacao {
  id: string;
  nome: string;
  criadaEm: Date;
  membros: DadosDoMembro[];
}

export interface DadosParaFundar {
  id: string;
  nome: string;
  dono: { membroId: string; usuarioId: string; nome: string; email: string };
}

/** Agregado raiz: uma organização e seus membros. */
export class Organizacao {
  private eventos: EventoDeOrganizacao[] = [];

  private constructor(
    readonly id: string,
    private _nome: string,
    readonly criadaEm: Date,
    private membros: Membro[],
  ) {}

  static fundar(dados: DadosParaFundar, agora: Date): Organizacao {
    const nome = dados.nome.trim();
    if (nome === '') {
      throw new ErroDeDominio('O nome da organização é obrigatório.', 'NOME_OBRIGATORIO');
    }
    const dono = Membro.ativo(
      {
        id: dados.dono.membroId,
        usuarioId: dados.dono.usuarioId,
        email: dados.dono.email,
        nome: dados.dono.nome,
        papel: 'DONO',
      },
      agora,
    );
    const organizacao = new Organizacao(dados.id, nome, agora, [dono]);
    organizacao.eventos.push(
      criarEvento('OrganizacaoFundada', dados.id, {
        organizacaoId: dados.id,
        nome,
        donoEmail: dono.email.valor,
      }, agora),
    );
    return organizacao;
  }

  static reconstituir(dados: DadosDaOrganizacao): Organizacao {
    return new Organizacao(
      dados.id,
      dados.nome,
      dados.criadaEm,
      dados.membros.map((m) => Membro.reconstituir(m)),
    );
  }

  get nome(): string {
    return this._nome;
  }

  listarMembros(): readonly Membro[] {
    return [...this.membros];
  }

  membroPorUsuario(usuarioId: string): Membro | undefined {
    return this.membros.find((m) => m.usuarioId === usuarioId);
  }

  membroPorId(membroId: string): Membro | undefined {
    return this.membros.find((m) => m.id === membroId);
  }

  convidarMembro(
    dados: { membroId: string; email: string; papel: Papel },
    porPapel: Papel,
    agora: Date,
  ): Membro {
    exigirPermissao(porPapel, 'GERENCIAR_MEMBROS');
    if (dados.papel === 'DONO') {
      throw new ErroDeDominio('Não é possível convidar alguém como DONO.', 'CONVITE_COMO_DONO');
    }
    const email = Email.criar(dados.email);
    if (this.membros.some((m) => m.email.igualA(email))) {
      throw new ErroDeDominio('Já existe um membro ou convite com este e-mail.', 'MEMBRO_DUPLICADO');
    }
    const membro = Membro.convidar({ id: dados.membroId, email: email.valor, papel: dados.papel }, agora);
    this.membros.push(membro);
    this.eventos.push(
      criarEvento('MembroConvidado', this.id, {
        membroId: membro.id,
        email: email.valor,
        papel: dados.papel,
      }, agora),
    );
    return membro;
  }

  aceitarConvite(membroId: string, usuarioId: string, nome: string, agora: Date): void {
    const membro = this.obterMembro(membroId);
    membro.aceitarConvite(usuarioId, nome, agora);
    this.eventos.push(criarEvento('ConviteAceito', this.id, { membroId, usuarioId }, agora));
  }

  alterarPapel(membroId: string, papel: Papel, porPapel: Papel, agora: Date = new Date(0)): void {
    exigirPermissao(porPapel, 'GERENCIAR_MEMBROS');
    const membro = this.obterMembro(membroId);
    if (membro.papel === 'DONO') {
      throw new ErroDeDominio('O papel do DONO não pode ser alterado.', 'DONO_IMUTAVEL');
    }
    if (papel === 'DONO') {
      throw new ErroDeDominio('Ninguém pode ser promovido a DONO.', 'PROMOCAO_A_DONO');
    }
    if (membro.papel === 'ADMIN' && porPapel !== 'DONO') {
      throw new ErroDeDominio(
        'Somente o DONO pode alterar o papel de um ADMIN.',
        'ALTERACAO_DE_ADMIN_NEGADA',
      );
    }
    const papelAnterior = membro.papel;
    membro.alterarPapel(papel);
    this.eventos.push(
      criarEvento('PapelAlterado', this.id, { membroId, papelAnterior, papelNovo: papel }, agora),
    );
  }

  removerMembro(membroId: string, porPapel: Papel, agora: Date = new Date(0)): void {
    exigirPermissao(porPapel, 'GERENCIAR_MEMBROS');
    const membro = this.obterMembro(membroId);
    if (membro.papel === 'DONO') {
      throw new ErroDeDominio('O DONO da organização não pode ser removido.', 'DONO_IMUTAVEL');
    }
    if (membro.papel === 'ADMIN' && porPapel !== 'DONO') {
      throw new ErroDeDominio('Somente o DONO pode remover um ADMIN.', 'REMOCAO_DE_ADMIN_NEGADA');
    }
    this.membros = this.membros.filter((m) => m.id !== membroId);
    this.eventos.push(
      criarEvento('MembroRemovido', this.id, { membroId, email: membro.email.valor }, agora),
    );
  }

  paraDados(): DadosDaOrganizacao {
    return {
      id: this.id,
      nome: this._nome,
      criadaEm: this.criadaEm,
      membros: this.membros.map((m) => m.paraDados()),
    };
  }

  puxarEventos(): EventoDeOrganizacao[] {
    const pendentes = this.eventos;
    this.eventos = [];
    return pendentes;
  }

  private obterMembro(membroId: string): Membro {
    const membro = this.membroPorId(membroId);
    if (!membro) throw new ErroDeDominio('Membro não encontrado.', 'MEMBRO_NAO_ENCONTRADO');
    return membro;
  }
}
