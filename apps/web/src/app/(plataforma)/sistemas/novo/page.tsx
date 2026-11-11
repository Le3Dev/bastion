"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alerta } from "@/componentes/Alerta";
import { CabecalhoDaPagina } from "@/componentes/CabecalhoDaPagina";
import { cadastrarSistema, sistemaPorId, verificarPropriedade } from "@/prototipo/armazem";
import { mensagemDeErro } from "@/prototipo/erros";
import { formatarData } from "@/prototipo/formatacao";
import {
  metodosDeVerificacaoDisponiveis,
  rotuloDoMetodoDeVerificacao,
  rotuloDoTipoDeSistema,
  tiposDeSistemaDisponiveis,
} from "@/prototipo/rotulos";
import type { MetodoDeVerificacao, TipoDeSistema } from "@/prototipo/tipos";
import { useArmazem } from "@/prototipo/useArmazem";
import { InstrucoesDeVerificacao } from "../_componentes/InstrucoesDeVerificacao";

const DESCRICAO_DOS_METODOS: Record<MetodoDeVerificacao, string> = {
  DNS_TXT: "Adicione um registro TXT no DNS do domínio de homologação. Indicado para quem controla o DNS.",
  ARQUIVO_WELL_KNOWN: "Publique um arquivo de texto no caminho /.well-known/ do ambiente de homologação.",
  CABECALHO_HTTP: "Configure o ambiente de homologação para devolver um cabeçalho HTTP com o token.",
};

const NOMES_DOS_PASSOS = ["1. Dados", "2. Verificação", "3. Confirmação"];

type Passo = 0 | 1 | 2;

interface ErrosDoFormulario {
  nome?: string;
  urlDeHomologacao?: string;
  dominioDeProducao?: string;
}

const validar = (nome: string, url: string, dominio: string): ErrosDoFormulario => {
  const erros: ErrosDoFormulario = {};
  if (nome.trim().length < 2) erros.nome = "Informe o nome do sistema.";
  if (!/^https:\/\/\S+$/i.test(url.trim())) erros.urlDeHomologacao = "Informe uma URL começando com https://.";
  if (dominio.trim().length === 0) erros.dominioDeProducao = "Informe o domínio de produção.";
  return erros;
};

const PaginaDeCadastroDeSistema = () => {
  const router = useRouter();
  const estado = useArmazem();
  const [passo, setPasso] = useState<Passo>(0);
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<TipoDeSistema>("SITE");
  const [urlDeHomologacao, setUrlDeHomologacao] = useState("");
  const [dominioDeProducao, setDominioDeProducao] = useState("");
  const [metodo, setMetodo] = useState<MetodoDeVerificacao>("DNS_TXT");
  const [erros, setErros] = useState<ErrosDoFormulario>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [sistemaId, setSistemaId] = useState<string | null>(null);

  const sistema = sistemaId ? sistemaPorId(estado, sistemaId) : undefined;

  const continuar = (evento: FormEvent<HTMLFormElement>): void => {
    evento.preventDefault();
    setErroGeral(null);
    const encontrados = validar(nome, urlDeHomologacao, dominioDeProducao);
    setErros(encontrados);
    if (Object.keys(encontrados).length > 0) return;
    try {
      const criado = cadastrarSistema({
        nome,
        tipo,
        urlDeHomologacao,
        dominioDeProducao,
        metodoDeVerificacao: metodo,
      });
      setSistemaId(criado.id);
      setPasso(1);
    } catch (erro) {
      setErroGeral(mensagemDeErro(erro));
    }
  };

  const verificar = (): void => {
    if (!sistema) return;
    setErroGeral(null);
    try {
      verificarPropriedade(sistema.id);
      setPasso(2);
    } catch (erro) {
      setErroGeral(mensagemDeErro(erro));
    }
  };

  return (
    <div className="page pilha">
      <CabecalhoDaPagina titulo="Cadastrar sistema" descricao="Informe os dados e comprove a propriedade do ambiente." />

      <ol className="passos" aria-label="Etapas do cadastro">
        {NOMES_DOS_PASSOS.map((rotulo, indice) => (
          <li
            key={rotulo}
            className={`passo ${indice === passo ? "passo-ativo" : ""} ${indice < passo ? "passo-concluido" : ""}`}
            aria-current={indice === passo ? "step" : undefined}
          >
            {rotulo}
          </li>
        ))}
      </ol>

      {erroGeral ? <Alerta tipo="error">{erroGeral}</Alerta> : null}

      {passo === 0 ? (
        <form className="card" onSubmit={continuar} noValidate>
          <div className="field">
            <label className="label" htmlFor="nome">
              Nome do sistema
            </label>
            <input id="nome" className="input" value={nome} onChange={(e) => setNome(e.target.value)} />
            {erros.nome ? <span className="erro-campo">{erros.nome}</span> : null}
          </div>

          <div className="field">
            <label className="label" htmlFor="tipo">
              Tipo
            </label>
            <select id="tipo" className="input" value={tipo} onChange={(e) => {
                const escolhido = tiposDeSistemaDisponiveis.find((t) => t === e.target.value);
                if (escolhido) setTipo(escolhido);
              }}
            >
              {tiposDeSistemaDisponiveis.map((t) => (
                <option key={t} value={t}>
                  {rotuloDoTipoDeSistema(t)}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="label" htmlFor="url">
              URL de homologação
            </label>
            <input
              id="url"
              className="input mono"
              placeholder="https://homolog.seusite.com.br"
              value={urlDeHomologacao}
              onChange={(e) => setUrlDeHomologacao(e.target.value)}
            />
            <span className="hint">Ambiente onde as avaliações serão executadas. Precisa usar https://.</span>
            {erros.urlDeHomologacao ? <span className="erro-campo">{erros.urlDeHomologacao}</span> : null}
          </div>

          <div className="field">
            <label className="label" htmlFor="producao">
              Domínio de produção
            </label>
            <input
              id="producao"
              className="input mono"
              placeholder="seusite.com.br"
              value={dominioDeProducao}
              onChange={(e) => setDominioDeProducao(e.target.value)}
            />
            <span className="hint">
              O Guardião de Escopo bloqueia este domínio: nenhuma requisição de avaliação será enviada a ele.
            </span>
            {erros.dominioDeProducao ? <span className="erro-campo">{erros.dominioDeProducao}</span> : null}
          </div>

          <fieldset className="field" style={{ border: "none", padding: 0 }}>
            <legend className="label">Método de verificação</legend>
            {metodosDeVerificacaoDisponiveis.map((m) => (
              <label key={m} className="linha" htmlFor={`metodo-${m}`} style={{ alignItems: "flex-start" }}>
                <input
                  id={`metodo-${m}`}
                  type="radio"
                  name="metodo"
                  value={m}
                  checked={metodo === m}
                  onChange={() => setMetodo(m)}
                />
                <span>
                  <strong>{rotuloDoMetodoDeVerificacao(m)}</strong>
                  <br />
                  <span className="texto-2">{DESCRICAO_DOS_METODOS[m]}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="linha">
            <button type="submit" className="btn btn-cta">
              Continuar
            </button>
            <Link href="/sistemas" className="btn btn-outline">
              Cancelar
            </Link>
          </div>
        </form>
      ) : null}

      {passo === 1 && sistema ? (
        <div className="card pilha">
          <h2 className="card-titulo">Comprove a propriedade de {sistema.nome}</h2>
          <InstrucoesDeVerificacao sistema={sistema} />
          <div className="linha">
            <button type="button" className="btn btn-cta" onClick={verificar}>
              Verificar agora
            </button>
            <button type="button" className="btn btn-outline" onClick={() => router.push("/sistemas")}>
              Verificar depois
            </button>
          </div>
        </div>
      ) : null}

      {passo === 2 && sistema ? (
        <div className="card pilha">
          <Alerta tipo="success">Propriedade comprovada. O sistema está liberado para avaliações.</Alerta>
          <dl className="lista-definicao">
            <dt>Sistema</dt>
            <dd>{sistema.nome}</dd>
            <dt>Homologação</dt>
            <dd className="mono">{sistema.urlDeHomologacao}</dd>
            <dt>Produção</dt>
            <dd>
              <span className="mono">{sistema.dominioDeProducao}</span>{" "}
              <span className="tag tag-critica">Bloqueado no Guardião</span>
            </dd>
            <dt>Verificação válida até</dt>
            <dd>{sistema.verificacao.expiraEm ? formatarData(sistema.verificacao.expiraEm) : "—"}</dd>
          </dl>
          <div className="linha">
            <Link href={`/avaliacoes/nova?sistemaId=${sistema.id}`} className="btn btn-cta">
              Nova avaliação
            </Link>
            <Link href="/sistemas" className="btn btn-outline">
              Ver sistemas
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default PaginaDeCadastroDeSistema;
