"use client";

import type { MembroDto } from "@bastion/contratos";
import { useState, type FormEvent } from "react";

export interface RiscoAceitoInformado {
  justificativa: string;
  responsavel: string;
  /** ISO 8601, fim do dia escolhido. */
  validoAte: string;
}

interface PropsDoFormulario {
  membros: MembroDto[];
  enviando?: boolean;
  aoConfirmar: (risco: RiscoAceitoInformado) => void;
  aoCancelar: () => void;
}

interface ErrosDoFormulario {
  justificativa?: string;
  responsavel?: string;
  validoAte?: string;
}

const MINIMO_DA_JUSTIFICATIVA = 20;

export const FormularioDeRiscoAceito = ({ membros, enviando = false, aoConfirmar, aoCancelar }: PropsDoFormulario) => {
  const [justificativa, setJustificativa] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [validoAte, setValidoAte] = useState("");
  const [erros, setErros] = useState<ErrosDoFormulario>({});

  const aoEnviar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const novosErros: ErrosDoFormulario = {};
    if (justificativa.trim().length < MINIMO_DA_JUSTIFICATIVA) {
      novosErros.justificativa = `Explique o motivo com pelo menos ${MINIMO_DA_JUSTIFICATIVA} caracteres.`;
    }
    if (responsavel === "") {
      novosErros.responsavel = "Escolha quem responde por este risco.";
    }
    if (validoAte === "") {
      novosErros.validoAte = "Informe até quando o risco é aceito.";
    } else {
      // O relógio só é lido aqui, no envio, para não quebrar a hidratação.
      const limite = new Date(`${validoAte}T23:59:59`);
      if (Number.isNaN(limite.getTime()) || limite.getTime() <= Date.now()) {
        novosErros.validoAte = "A validade precisa ser uma data futura.";
      }
    }
    setErros(novosErros);
    if (Object.keys(novosErros).length > 0) return;
    aoConfirmar({
      justificativa: justificativa.trim(),
      responsavel,
      validoAte: new Date(`${validoAte}T23:59:59`).toISOString(),
    });
  };

  return (
    <form className="card" onSubmit={aoEnviar} noValidate>
      <h3 className="card-titulo">Aceitar o risco</h3>
      <div className="field">
        <label className="label" htmlFor="risco-justificativa">
          Justificativa
        </label>
        <textarea
          id="risco-justificativa"
          className="input"
          value={justificativa}
          onChange={(e) => setJustificativa(e.target.value)}
          aria-invalid={erros.justificativa !== undefined}
        />
        <span className="hint">Mínimo de {MINIMO_DA_JUSTIFICATIVA} caracteres. Fica registrado no histórico.</span>
        {erros.justificativa ? <span className="erro-campo">{erros.justificativa}</span> : null}
      </div>
      <div className="grade-2">
        <div className="field">
          <label className="label" htmlFor="risco-responsavel">
            Responsável
          </label>
          <select
            id="risco-responsavel"
            className="input"
            value={responsavel}
            onChange={(e) => setResponsavel(e.target.value)}
            aria-invalid={erros.responsavel !== undefined}
          >
            <option value="">Selecione</option>
            {membros
              .filter((m) => m.estado === "ATIVO")
              .map((m) => (
                <option key={m.id} value={m.nome ?? m.email}>
                  {m.nome ?? m.email}
                </option>
              ))}
          </select>
          {erros.responsavel ? <span className="erro-campo">{erros.responsavel}</span> : null}
        </div>
        <div className="field">
          <label className="label" htmlFor="risco-valido-ate">
            Válido até
          </label>
          <input
            id="risco-valido-ate"
            type="date"
            className="input"
            value={validoAte}
            onChange={(e) => setValidoAte(e.target.value)}
            aria-invalid={erros.validoAte !== undefined}
          />
          {erros.validoAte ? <span className="erro-campo">{erros.validoAte}</span> : null}
        </div>
      </div>
      <div className="linha">
        <button type="submit" className="btn btn-cta" disabled={enviando}>
          {enviando ? "Registrando..." : "Aceitar o risco"}
        </button>
        <button type="button" className="btn btn-outline" onClick={aoCancelar} disabled={enviando}>
          Cancelar
        </button>
      </div>
    </form>
  );
};
