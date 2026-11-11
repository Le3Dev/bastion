"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { Alerta } from "@/componentes/Alerta";
import { CabecalhoDaPagina } from "@/componentes/CabecalhoDaPagina";
import { sistemaPorId, solicitarAvaliacao } from "@/prototipo/armazem";
import { mensagemDeErro } from "@/prototipo/erros";
import { rotuloDoPerfil } from "@/prototipo/rotulos";
import type { Agenda, FrequenciaDaAgenda, PerfilDeAvaliacao } from "@/prototipo/tipos";
import { useArmazem } from "@/prototipo/useArmazem";
import estilos from "./nova.module.css";

interface OpcaoDePerfil {
  perfil: PerfilDeAvaliacao;
  descricao: string;
  habilitado: boolean;
}

const PERFIS: OpcaoDePerfil[] = [
  {
    perfil: "PASSIVO",
    descricao: "Não intrusivo: cabeçalhos de segurança, TLS e certificado, flags de cookies e exposição de versão.",
    habilitado: true,
  },
  { perfil: "PADRAO", descricao: "Disponível depois do MVP.", habilitado: false },
  { perfil: "COMPLETO", descricao: "Disponível depois do MVP.", habilitado: false },
];

const FREQUENCIAS: { valor: FrequenciaDaAgenda; rotulo: string }[] = [
  { valor: "DIARIA", rotulo: "Diária" },
  { valor: "SEMANAL", rotulo: "Semanal" },
  { valor: "MENSAL", rotulo: "Mensal" },
];

const FormularioDeNovaAvaliacao = () => {
  const router = useRouter();
  const estado = useArmazem();
  const parametros = useSearchParams();
  const sistemaDaQuery = parametros.get("sistemaId") ?? "";

  const [sistemaId, setSistemaId] = useState(sistemaDaQuery);
  const [perfil, setPerfil] = useState<PerfilDeAvaliacao>("PASSIVO");
  const [recorrente, setRecorrente] = useState(false);
  const [frequencia, setFrequencia] = useState<FrequenciaDaAgenda>("SEMANAL");
  const [notaMinima, setNotaMinima] = useState("70");
  const [erros, setErros] = useState<{ sistema?: string; nota?: string }>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);

  const sistema = sistemaId ? sistemaPorId(estado, sistemaId) : undefined;

  const iniciar = (evento: FormEvent<HTMLFormElement>): void => {
    evento.preventDefault();
    setErroGeral(null);
    const nota = Number(notaMinima);
    const encontrados: { sistema?: string; nota?: string } = {};
    if (!sistema) encontrados.sistema = "Escolha um sistema.";
    else if (sistema.verificacao.estado !== "VERIFICADO") encontrados.sistema = "A propriedade deste sistema não está verificada.";
    if (notaMinima.trim() === "" || !Number.isFinite(nota) || nota < 0 || nota > 100) {
      encontrados.nota = "Informe uma nota entre 0 e 100.";
    }
    setErros(encontrados);
    if (Object.keys(encontrados).length > 0 || !sistema) return;
    const agenda: Agenda = recorrente ? { tipo: "RECORRENTE", frequencia } : { tipo: "UNICA" };
    try {
      const id = solicitarAvaliacao({ sistemaId: sistema.id, perfil, agenda, notaMinima: nota });
      router.push(`/avaliacoes/${id}`);
    } catch (erro) {
      setErroGeral(mensagemDeErro(erro));
    }
  };

  return (
    <form className="pilha" onSubmit={iniciar} noValidate>
      {erroGeral ? <Alerta tipo="error">{erroGeral}</Alerta> : null}

      <div className="card">
        <div className="field">
          <label className="label" htmlFor="sistema">
            Sistema
          </label>
          <select id="sistema" className="input" value={sistemaId} onChange={(e) => setSistemaId(e.target.value)}>
            <option value="">Selecione um sistema</option>
            {estado.sistemas.map((s) => {
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
        </div>

        <fieldset className="field" style={{ border: "none", padding: 0 }}>
          <legend className="label">Perfil</legend>
          <div className="grade-3">
            {PERFIS.map((p) => {
              const selecionado = perfil === p.perfil;
              const classes = [
                estilos.cartaoDePerfil,
                selecionado ? estilos.selecionado : "",
                p.habilitado ? "" : estilos.desabilitado,
              ].join(" ");
              return (
                <label key={p.perfil} className={classes} htmlFor={`perfil-${p.perfil}`}>
                  <input
                    id={`perfil-${p.perfil}`}
                    type="radio"
                    name="perfil"
                    value={p.perfil}
                    checked={selecionado}
                    disabled={!p.habilitado}
                    onChange={() => setPerfil(p.perfil)}
                  />
                  <span>
                    <strong>{rotuloDoPerfil(p.perfil)}</strong>
                    <br />
                    <span className="texto-2">{p.descricao}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="field" style={{ border: "none", padding: 0 }}>
          <legend className="label">Agenda</legend>
          <div className="linha">
            <label className="linha" htmlFor="agenda-agora">
              <input
                id="agenda-agora"
                type="radio"
                name="agenda"
                checked={!recorrente}
                onChange={() => setRecorrente(false)}
              />
              Executar agora
            </label>
            <label className="linha" htmlFor="agenda-recorrente">
              <input
                id="agenda-recorrente"
                type="radio"
                name="agenda"
                checked={recorrente}
                onChange={() => setRecorrente(true)}
              />
              Recorrente
            </label>
          </div>
        </fieldset>

        {recorrente ? (
          <div className="field">
            <label className="label" htmlFor="frequencia">
              Frequência
            </label>
            <select
              id="frequencia"
              className="input"
              value={frequencia}
              onChange={(e) => {
                const escolhida = FREQUENCIAS.find((f) => f.valor === e.target.value);
                if (escolhida) setFrequencia(escolhida.valor);
              }}
            >
              {FREQUENCIAS.map((f) => (
                <option key={f.valor} value={f.valor}>
                  {f.rotulo}
                </option>
              ))}
            </select>
          </div>
        ) : null}

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
            <dt>Limite de taxa</dt>
            <dd>até 5 requisições por segundo</dd>
          </dl>
        ) : (
          <p className="texto-2">Selecione um sistema para ver o escopo autorizado.</p>
        )}
      </div>

      <div className="linha">
        <button type="submit" className="btn btn-cta">
          Iniciar avaliação
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
    <CabecalhoDaPagina titulo="Nova avaliação" descricao="Escolha o sistema, o perfil e a agenda da avaliação." />
    <Suspense fallback={<p className="texto-2">Carregando…</p>}>
      <FormularioDeNovaAvaliacao />
    </Suspense>
  </div>
);

export default PaginaDeNovaAvaliacao;
