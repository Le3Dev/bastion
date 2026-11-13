"use client";

import type { AgendamentoDto, PerfilDeAvaliacao } from "@bastion/contratos";
import { useState, type FormEvent } from "react";
import { alterarAgendamento, criarAgendamento, listarAgendamentos, removerAgendamento } from "@/api/agendamentos";
import { mensagemDoErro } from "@/api/cliente";
import { TEXTO_SEM_PERMISSAO, useSessao } from "@/api/sessao";
import { listarSistemas } from "@/api/sistemas";
import { useConsulta } from "@/api/useConsulta";
import { formatarDataHora } from "@/apresentacao/formatacao";
import { rotuloDoPerfil } from "@/apresentacao/rotulos";
import { Alerta } from "@/componentes/Alerta";
import { CabecalhoDaPagina } from "@/componentes/CabecalhoDaPagina";
import { EstadoVazio } from "@/componentes/EstadoVazio";
import { BotaoDeConfirmacao } from "../integracoes/_componentes/BotaoDeConfirmacao";
import estilos from "../avaliacoes/nova/nova.module.css";

type Frequencia = AgendamentoDto["frequencia"];

const PERFIS: PerfilDeAvaliacao[] = ["PASSIVO", "PADRAO", "COMPLETO", "IA"];
const DIAS_DA_SEMANA = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const ROTULOS_DE_FREQUENCIA: Record<Frequencia, string> = { DIARIA: "Diária", SEMANAL: "Semanal", MENSAL: "Mensal" };

const descreverFrequencia = (a: AgendamentoDto): string => {
  const base = ROTULOS_DE_FREQUENCIA[a.frequencia];
  if (a.frequencia === "SEMANAL" && a.diaDaSemana !== null) {
    return `${base}, ${DIAS_DA_SEMANA[a.diaDaSemana] ?? `dia ${a.diaDaSemana}`}, ${a.horario}`;
  }
  if (a.frequencia === "MENSAL" && a.diaDoMes !== null) return `${base}, dia ${a.diaDoMes}, ${a.horario}`;
  return `${base}, ${a.horario}`;
};

const FormularioDeNovoAgendamento = ({ aoCriar, podeSolicitar }: { aoCriar: () => void; podeSolicitar: boolean }) => {
  const { dados } = useConsulta(listarSistemas);
  const [sistemaId, setSistemaId] = useState("");
  const [perfil, setPerfil] = useState<PerfilDeAvaliacao>("PASSIVO");
  const [notaMinima, setNotaMinima] = useState("70");
  const [frequencia, setFrequencia] = useState<Frequencia>("DIARIA");
  const [diaDaSemana, setDiaDaSemana] = useState("1");
  const [diaDoMes, setDiaDoMes] = useState("1");
  const [horario, setHorario] = useState("03:00");
  const [responsavel, setResponsavel] = useState("");
  const [referencia, setReferencia] = useState("");
  const [aceito, setAceito] = useState(false);
  const [permitirCriacaoDeDados, setPermitirCriacaoDeDados] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const sistemas = (dados ?? []).filter((s) => !s.arquivado && s.verificacao.estado === "VERIFICADO");
  const sistema = sistemas.find((s) => s.id === sistemaId);
  const ativo = perfil !== "PASSIVO";
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

  const salvar = async (evento: FormEvent<HTMLFormElement>): Promise<void> => {
    evento.preventDefault();
    setErro(null);
    setSucesso(null);
    const nota = Number(notaMinima);
    if (!sistema) return setErro("Escolha um sistema verificado.");
    if (notaMinima.trim() === "" || !Number.isInteger(nota) || nota < 0 || nota > 100) {
      return setErro("Informe uma nota mínima inteira entre 0 e 100.");
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(horario)) return setErro("Informe o horário no formato HH:MM.");
    const dia = Number(diaDoMes);
    if (frequencia === "MENSAL" && (!Number.isInteger(dia) || dia < 1 || dia > 28)) {
      return setErro("Informe o dia do mês entre 1 e 28.");
    }
    if (!autorizado) return;
    setEnviando(true);
    try {
      await criarAgendamento({
        sistemaId: sistema.id,
        perfil,
        notaMinima: nota,
        frequencia,
        horario,
        ...(frequencia === "SEMANAL" ? { diaDaSemana: Number(diaDaSemana) } : {}),
        ...(frequencia === "MENSAL" ? { diaDoMes: dia } : {}),
        ...(ativo ? { autorizacao: { responsavel: responsavel.trim(), referencia: referencia.trim(), aceito: true as const } } : {}),
        permitirCriacaoDeDados: perfil === "COMPLETO" && permitirCriacaoDeDados,
      });
      setSucesso("Agendamento criado.");
      setSistemaId("");
      setPerfil("PASSIVO");
      setAceito(false);
      setResponsavel("");
      setReferencia("");
      setPermitirCriacaoDeDados(false);
      aoCriar();
    } catch (e) {
      setErro(mensagemDoErro(e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form className="card pilha" onSubmit={(e) => void salvar(e)} noValidate>
      <h2 className="card-titulo">Novo agendamento</h2>
      {erro ? <Alerta tipo="error">{erro}</Alerta> : null}
      {sucesso ? <Alerta tipo="success">{sucesso}</Alerta> : null}
      {!podeSolicitar ? <Alerta tipo="info">{TEXTO_SEM_PERMISSAO}: o seu papel não pode criar agendamentos.</Alerta> : null}

      <div className="field">
        <label className="label" htmlFor="ag-sistema">
          Sistema
        </label>
        <select id="ag-sistema" className="input" value={sistemaId} onChange={(e) => escolherSistema(e.target.value)}>
          <option value="">Selecione um sistema</option>
          {sistemas.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nome}
            </option>
          ))}
        </select>
        <span className="hint">Só aparecem sistemas com propriedade verificada e não arquivados.</span>
      </div>

      <fieldset className="field" style={{ border: "none", padding: 0 }}>
        <legend className="label">Perfil</legend>
        <div className="grade-3">
          {PERFIS.map((p) => {
            const indisponivel = motivoDeIndisponivel(p);
            const habilitado = indisponivel === null;
            const selecionado = perfil === p;
            const classes = [estilos.cartaoDePerfil, selecionado ? estilos.selecionado : "", habilitado ? "" : estilos.desabilitado].join(" ");
            return (
              <label key={p} className={classes} htmlFor={`ag-perfil-${p}`}>
                <input
                  id={`ag-perfil-${p}`}
                  type="radio"
                  name="ag-perfil"
                  checked={selecionado}
                  disabled={!habilitado}
                  onChange={() => escolherPerfil(p)}
                />
                <span>
                  <strong>{rotuloDoPerfil(p)}</strong>
                  {indisponivel ? (
                    <>
                      <br />
                      <span className="hint">{indisponivel}</span>
                    </>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="field">
        <label className="label" htmlFor="ag-nota">
          Nota mínima
        </label>
        <input id="ag-nota" className="input" type="number" min={0} max={100} value={notaMinima} onChange={(e) => setNotaMinima(e.target.value)} />
      </div>

      <div className="field">
        <label className="label" htmlFor="ag-frequencia">
          Frequência
        </label>
        <select id="ag-frequencia" className="input" value={frequencia} onChange={(e) => setFrequencia(e.target.value as Frequencia)}>
          {(Object.keys(ROTULOS_DE_FREQUENCIA) as Frequencia[]).map((f) => (
            <option key={f} value={f}>
              {ROTULOS_DE_FREQUENCIA[f]}
            </option>
          ))}
        </select>
      </div>

      {frequencia === "SEMANAL" ? (
        <div className="field">
          <label className="label" htmlFor="ag-dia-semana">
            Dia da semana
          </label>
          <select id="ag-dia-semana" className="input" value={diaDaSemana} onChange={(e) => setDiaDaSemana(e.target.value)}>
            {DIAS_DA_SEMANA.map((nome, i) => (
              <option key={nome} value={String(i)}>
                {nome}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {frequencia === "MENSAL" ? (
        <div className="field">
          <label className="label" htmlFor="ag-dia-mes">
            Dia do mês
          </label>
          <input id="ag-dia-mes" className="input" type="number" min={1} max={28} value={diaDoMes} onChange={(e) => setDiaDoMes(e.target.value)} />
          <span className="hint">De 1 a 28, para valer em todos os meses.</span>
        </div>
      ) : null}

      <div className="field">
        <label className="label" htmlFor="ag-horario">
          Horário
        </label>
        <input id="ag-horario" className="input" type="time" value={horario} onChange={(e) => setHorario(e.target.value)} />
      </div>

      {ativo ? (
        <div className="pilha">
          <h3 className="card-titulo">Autorização</h3>
          <Alerta tipo="info">
            O Bastion só avalia sistemas com propriedade comprovada e nunca avalia produção. Testes ativos enviam
            requisições de ataque controladas ao ambiente de homologação.
          </Alerta>
          <div className="field">
            <label className="label" htmlFor="ag-autorizacao-responsavel">
              Responsável pela autorização
            </label>
            <input id="ag-autorizacao-responsavel" className="input" type="text" value={responsavel} onChange={(e) => setResponsavel(e.target.value)} />
          </div>
          <div className="field">
            <label className="label" htmlFor="ag-autorizacao-referencia">
              Referência (contrato/escopo autorizado)
            </label>
            <input id="ag-autorizacao-referencia" className="input" type="text" value={referencia} onChange={(e) => setReferencia(e.target.value)} />
          </div>
          <label className="linha" htmlFor="ag-autorizacao-aceito">
            <input id="ag-autorizacao-aceito" type="checkbox" checked={aceito} onChange={(e) => setAceito(e.target.checked)} />
            Confirmo que tenho autorização por escrito para avaliar este sistema.
          </label>
          {perfil === "COMPLETO" ? (
            <label className="linha" htmlFor="ag-permitir-criacao">
              <input id="ag-permitir-criacao" type="checkbox" checked={permitirCriacaoDeDados} onChange={(e) => setPermitirCriacaoDeDados(e.target.checked)} />
              Permitir criação de registros de teste na homologação (apenas Completo)
            </label>
          ) : null}
        </div>
      ) : null}

      <div className="linha">
        <button type="submit" className="btn btn-cta" disabled={!podeSolicitar || enviando || !autorizado} title={podeSolicitar ? undefined : TEXTO_SEM_PERMISSAO}>
          {enviando ? "Criando..." : "Criar agendamento"}
        </button>
      </div>
    </form>
  );
};

const PaginaDeAgendamentos = () => {
  const { pode } = useSessao();
  const podeSolicitar = pode("solicitarAvaliacao");
  const { dados, erro, carregando, recarregar } = useConsulta(listarAgendamentos);
  const [erroDeAcao, setErroDeAcao] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const executar = async (id: string, acao: () => Promise<unknown>): Promise<void> => {
    setErroDeAcao(null);
    setOcupado(id);
    try {
      await acao();
      recarregar();
    } catch (e) {
      setErroDeAcao(mensagemDoErro(e));
    } finally {
      setOcupado(null);
    }
  };

  const agendamentos = dados ?? [];

  return (
    <div className="page-wide pilha">
      <CabecalhoDaPagina titulo="Agendamentos" descricao="Avaliações recorrentes executadas automaticamente." />
      {erro ? <Alerta tipo="error">{erro}</Alerta> : null}
      {erroDeAcao ? <Alerta tipo="error">{erroDeAcao}</Alerta> : null}

      <div className="card">
        {carregando && dados === null ? (
          <p className="texto-2">Carregando agendamentos...</p>
        ) : agendamentos.length === 0 ? (
          <EstadoVazio titulo="Nenhum agendamento" descricao="Crie um agendamento abaixo para avaliar um sistema de forma recorrente." />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Sistema</th>
                <th>Perfil</th>
                <th>Frequência</th>
                <th>Estado</th>
                <th>Próxima execução</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {agendamentos.map((a) => {
                const desabilitado = !podeSolicitar || ocupado !== null;
                const dica = podeSolicitar ? undefined : TEXTO_SEM_PERMISSAO;
                return (
                  <tr key={a.id}>
                    <td>{a.sistemaNome}</td>
                    <td>{rotuloDoPerfil(a.perfil)}</td>
                    <td>{descreverFrequencia(a)}</td>
                    <td>{a.ativo ? <span className="tag tag-baixa">Ativo</span> : <span className="tag tag-neutra">Pausado</span>}</td>
                    <td>{a.ativo && a.proximaExecucaoEm ? formatarDataHora(a.proximaExecucaoEm) : "—"}</td>
                    <td>
                      <div className="linha">
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          disabled={desabilitado}
                          title={dica}
                          onClick={() => void executar(a.id, () => alterarAgendamento(a.id, { ativo: !a.ativo }))}
                        >
                          {a.ativo ? "Pausar" : "Retomar"}
                        </button>
                        <BotaoDeConfirmacao
                          rotulo="Remover"
                          desabilitado={desabilitado}
                          titulo={dica}
                          aoConfirmar={() => void executar(a.id, () => removerAgendamento(a.id))}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <FormularioDeNovoAgendamento aoCriar={recarregar} podeSolicitar={podeSolicitar} />
    </div>
  );
};

export default PaginaDeAgendamentos;
