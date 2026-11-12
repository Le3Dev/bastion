"use client";

import type { PerfilDeAvaliacao } from "@bastion/contratos";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { solicitarAvaliacao } from "@/api/avaliacoes";
import { mensagemDoErro } from "@/api/cliente";
import { TEXTO_SEM_PERMISSAO, useSessao } from "@/api/sessao";
import { listarSistemas } from "@/api/sistemas";
import { useConsulta } from "@/api/useConsulta";
import { rotuloDoPerfil } from "@/apresentacao/rotulos";
import { Alerta } from "@/componentes/Alerta";
import { CabecalhoDaPagina } from "@/componentes/CabecalhoDaPagina";
import estilos from "./nova.module.css";

interface OpcaoDePerfil {
  perfil: PerfilDeAvaliacao;
  descricao: string;
}

const PERFIS: OpcaoDePerfil[] = [
  {
    perfil: "PASSIVO",
    descricao: "Não intrusivo: cabeçalhos de segurança, TLS e certificado, flags de cookies e exposição de versão.",
  },
  {
    perfil: "PADRAO",
    descricao:
      "Teste ativo não autenticado: mapeia páginas e verifica configurações expostas, CORS, métodos HTTP, redirecionamento aberto e entrada refletida.",
  },
  {
    perfil: "COMPLETO",
    descricao:
      "Teste ativo autenticado (login de teste): inclui o Padrão e verifica controle de acesso e injeção. Requer credencial de teste no sistema.",
  },
  {
    perfil: "IA",
    descricao:
      "Teste de chatbots/agentes (OWASP LLM): integridade do prompt, vazamento de informação e segurança da saída. Só para sistemas do tipo App com IA e com conector configurado.",
  },
];

const ehPerfilAtivo = (p: PerfilDeAvaliacao): boolean => p !== "PASSIVO";

const FormularioDeNovaAvaliacao = () => {
  const router = useRouter();
  const { pode } = useSessao();
  const podeSolicitar = pode("solicitarAvaliacao");
  const { dados, erro: erroDaLista, carregando } = useConsulta(listarSistemas);
  const parametros = useSearchParams();
  const sistemaDaQuery = parametros.get("sistemaId") ?? "";

  const [sistemaId, setSistemaId] = useState(sistemaDaQuery);
  const [perfil, setPerfil] = useState<PerfilDeAvaliacao>("PASSIVO");
  const [notaMinima, setNotaMinima] = useState("70");
  const [erros, setErros] = useState<{ sistema?: string; nota?: string }>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const [responsavel, setResponsavel] = useState("");
  const [referencia, setReferencia] = useState("");
  const [aceito, setAceito] = useState(false);
  const [permitirCriacaoDeDados, setPermitirCriacaoDeDados] = useState(false);

  const sistemas = (dados ?? []).filter((s) => !s.arquivado);
  const sistema = sistemaId ? sistemas.find((s) => s.id === sistemaId) : undefined;
  const ativo = ehPerfilAtivo(perfil);
  const autorizado = !ativo || (responsavel.trim() !== "" && referencia.trim() !== "" && aceito);

  const motivoDeIndisponivel = (p: PerfilDeAvaliacao): string | null => {
    if (p !== "IA") return null;
    if (!sistema) return "Selecione um sistema do tipo App com IA.";
    if (sistema.tipo !== "APP_COM_IA") return "Disponível só para sistemas do tipo App com IA.";
    if (!sistema.conectorDeIa.configurado) return "Configure o conector de IA em Sistemas.";
    return null;
  };

  const escolherSistema = (id: string): void => {
    setSistemaId(id);
    const novo = sistemas.find((s) => s.id === id);
    const iaOk = novo?.tipo === "APP_COM_IA" && novo.conectorDeIa.configurado;
    if (perfil === "IA" && !iaOk) setPerfil("PASSIVO");
  };

  const escolherPerfil = (p: PerfilDeAvaliacao): void => {
    setPerfil(p);
    if (p !== "COMPLETO") setPermitirCriacaoDeDados(false);
  };

  const iniciar = async (evento: FormEvent<HTMLFormElement>): Promise<void> => {
    evento.preventDefault();
    setErroGeral(null);
    const nota = Number(notaMinima);
    const encontrados: { sistema?: string; nota?: string } = {};
    if (!sistema) encontrados.sistema = "Escolha um sistema.";
    else if (sistema.verificacao.estado !== "VERIFICADO") {
      encontrados.sistema = "A propriedade deste sistema não está verificada.";
    }
    if (notaMinima.trim() === "" || !Number.isInteger(nota) || nota < 0 || nota > 100) {
      encontrados.nota = "Informe uma nota inteira entre 0 e 100.";
    }
    setErros(encontrados);
    if (Object.keys(encontrados).length > 0 || !sistema) return;
    if (!autorizado) return;
    setEnviando(true);
    try {
      const resposta = await solicitarAvaliacao({
        sistemaId: sistema.id,
        perfil,
        notaMinima: nota,
        permitirCriacaoDeDados: perfil === "COMPLETO" && permitirCriacaoDeDados,
        ...(ativo ? { autorizacao: { responsavel: responsavel.trim(), referencia: referencia.trim(), aceito: true as const } } : {}),
      });
      router.push(`/avaliacoes/${resposta.id}`);
    } catch (erro) {
      setErroGeral(mensagemDoErro(erro));
      setEnviando(false);
    }
  };

  return (
    <form className="pilha" onSubmit={(e) => void iniciar(e)} noValidate>
      {erroGeral ? <Alerta tipo="error">{erroGeral}</Alerta> : null}
      {erroDaLista ? <Alerta tipo="error">{erroDaLista}</Alerta> : null}
      {!podeSolicitar ? <Alerta tipo="info">{TEXTO_SEM_PERMISSAO}: o seu papel não pode solicitar avaliações.</Alerta> : null}

      <div className="card">
        <div className="field">
          <label className="label" htmlFor="sistema">
            Sistema
          </label>
          <select id="sistema" className="input" value={sistemaId} onChange={(e) => escolherSistema(e.target.value)}>
            <option value="">{carregando && dados === null ? "Carregando sistemas..." : "Selecione um sistema"}</option>
            {sistemas.map((s) => {
              const verificado = s.verificacao.estado === "VERIFICADO";
              return (
                <option key={s.id} value={s.id} disabled={!verificado}>
                  {s.nome}
                  {verificado ? "" : " (propriedade não verificada)"}
                </option>
              );
            })}
          </select>
          {erros.sistema ? <span className="erro-campo">{erros.sistema}</span> : null}
          {sistemas.some((s) => s.verificacao.estado !== "VERIFICADO") ? (
            <span className="hint">
              Sistemas sem propriedade verificada ficam desabilitados. <Link href="/sistemas">Verificar em Sistemas</Link>.
            </span>
          ) : null}
        </div>

        <fieldset className="field" style={{ border: "none", padding: 0 }}>
          <legend className="label">Perfil</legend>
          <div className="grade-3">
            {PERFIS.map((p) => {
              const selecionado = perfil === p.perfil;
              const indisponivel = motivoDeIndisponivel(p.perfil);
              const habilitado = indisponivel === null;
              const classes = [
                estilos.cartaoDePerfil,
                selecionado ? estilos.selecionado : "",
                habilitado ? "" : estilos.desabilitado,
              ].join(" ");
              return (
                <label key={p.perfil} className={classes} htmlFor={`perfil-${p.perfil}`}>
                  <input
                    id={`perfil-${p.perfil}`}
                    type="radio"
                    name="perfil"
                    value={p.perfil}
                    checked={selecionado}
                    disabled={!habilitado}
                    onChange={() => escolherPerfil(p.perfil)}
                  />
                  <span>
                    <strong>{rotuloDoPerfil(p.perfil)}</strong>
                    <br />
                    <span className="texto-2">{p.descricao}</span>
                    {indisponivel ? (
                      <>
                        <br />
                        <span className="hint">{indisponivel}</span>
                      </>
                    ) : null}
                    {p.perfil === "COMPLETO" && sistema && !sistema.credencialDeTeste.configurada ? (
                      <>
                        <br />
                        <span className="hint">
                          Sem credencial, o Completo roda sem autenticação. Configure a credencial em Sistemas.
                        </span>
                      </>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="field" style={{ border: "none", padding: 0 }}>
          <legend className="label">Agenda</legend>
          <label className="linha" htmlFor="agenda-agora">
            <input id="agenda-agora" type="radio" name="agenda" checked readOnly />
            Executar agora
          </label>
          <span className="hint">O agendamento recorrente fica para depois do MVP.</span>
        </fieldset>

        <div className="field">
          <label className="label" htmlFor="nota-minima">
            Nota mínima
          </label>
          <input
            id="nota-minima"
            className="input"
            type="number"
            min={0}
            max={100}
            value={notaMinima}
            onChange={(e) => setNotaMinima(e.target.value)}
          />
          <span className="hint">Abaixo dela a avaliação reprova o pipeline de CI.</span>
          {erros.nota ? <span className="erro-campo">{erros.nota}</span> : null}
        </div>
      </div>

      {ativo ? (
        <div className="card pilha">
          <h2 className="card-titulo">Autorização</h2>
          <Alerta tipo="info">
            O Bastion só avalia sistemas com propriedade comprovada e nunca avalia produção. Testes ativos enviam
            requisições de ataque controladas ao ambiente de homologação.
          </Alerta>
          <div className="field">
            <label className="label" htmlFor="autorizacao-responsavel">
              Responsável pela autorização
            </label>
            <input
              id="autorizacao-responsavel"
              className="input"
              type="text"
              value={responsavel}
              onChange={(e) => setResponsavel(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="autorizacao-referencia">
              Referência (contrato/escopo autorizado)
            </label>
            <input
              id="autorizacao-referencia"
              className="input"
              type="text"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
            />
          </div>
          <label className="linha" htmlFor="autorizacao-aceito">
            <input
              id="autorizacao-aceito"
              type="checkbox"
              checked={aceito}
              onChange={(e) => setAceito(e.target.checked)}
            />
            Confirmo que tenho autorização por escrito para avaliar este sistema.
          </label>
          {perfil === "COMPLETO" ? (
            <div className="field">
              <label className="linha" htmlFor="permitir-criacao">
                <input
                  id="permitir-criacao"
                  type="checkbox"
                  checked={permitirCriacaoDeDados}
                  onChange={(e) => setPermitirCriacaoDeDados(e.target.checked)}
                />
                Permitir criação de registros de teste na homologação (apenas Completo)
              </label>
              <span className="hint">Os registros criados são marcados com o prefixo bastion-teste-.</span>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="card">
        <h2 className="card-titulo">Escopo autorizado</h2>
        {sistema ? (
          <dl className="lista-definicao">
            <dt>Sistema</dt>
            <dd>{sistema.nome}</dd>
            <dt>Homologação permitida</dt>
            <dd className="mono">{sistema.urlDeHomologacao}</dd>
            <dt>Produção bloqueada</dt>
            <dd>
              <span className="mono">{sistema.dominioDeProducao}</span>{" "}
              <span className="tag tag-critica">Bloqueado no Guardião</span>
            </dd>
          </dl>
        ) : (
          <p className="texto-2">Selecione um sistema para ver o escopo autorizado.</p>
        )}
      </div>

      <div className="linha">
        <button
          type="submit"
          className="btn btn-cta"
          disabled={!podeSolicitar || enviando || !autorizado}
          title={podeSolicitar ? undefined : TEXTO_SEM_PERMISSAO}
        >
          {enviando ? "Iniciando..." : "Iniciar avaliação"}
        </button>
        <Link href="/avaliacoes" className="btn btn-outline">
          Cancelar
        </Link>
      </div>
    </form>
  );
};

const PaginaDeNovaAvaliacao = () => (
  <div className="page pilha">
    <CabecalhoDaPagina titulo="Nova avaliação" descricao="Escolha o sistema e o perfil da avaliação." />
    <Suspense fallback={<p className="texto-2">Carregando…</p>}>
      <FormularioDeNovaAvaliacao />
    </Suspense>
  </div>
);

export default PaginaDeNovaAvaliacao;
