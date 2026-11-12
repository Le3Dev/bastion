"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { mensagemDoErro } from "@/api/cliente";
import { aceitarConvite } from "@/api/contas";
import { Alerta } from "@/componentes/Alerta";

const TAMANHO_MINIMO_DA_SENHA = 12;

const FormularioDeConvite = () => {
  const roteador = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [nome, definirNome] = useState("");
  const [senha, definirSenha] = useState("");
  const [erroDoNome, definirErroDoNome] = useState<string | null>(null);
  const [erroDaSenha, definirErroDaSenha] = useState<string | null>(null);
  const [erroGeral, definirErroGeral] = useState<string | null>(null);
  const [enviando, definirEnviando] = useState(false);

  const aoEnviar = async (evento: FormEvent<HTMLFormElement>): Promise<void> => {
    evento.preventDefault();
    definirErroGeral(null);
    const nomeValido = nome.trim().length > 0;
    const senhaValida = senha.length >= TAMANHO_MINIMO_DA_SENHA;
    definirErroDoNome(nomeValido ? null : "Informe seu nome.");
    definirErroDaSenha(senhaValida ? null : `A senha precisa ter ao menos ${TAMANHO_MINIMO_DA_SENHA} caracteres.`);
    if (!nomeValido || !senhaValida) return;
    definirEnviando(true);
    try {
      await aceitarConvite({ token, nome: nome.trim(), senha });
      roteador.push("/painel");
    } catch (erro) {
      definirErroGeral(mensagemDoErro(erro));
      definirEnviando(false);
    }
  };

  if (token === "") {
    return (
      <div className="pilha">
        <Alerta tipo="error">Link de convite inválido: o token não foi informado. Peça um novo convite.</Alerta>
        <Link href="/login" className="btn btn-outline">
          Ir para o login
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void aoEnviar(e)} noValidate>
      <div className="field">
        <label className="label" htmlFor="nome">
          Seu nome
        </label>
        <input
          id="nome"
          className="input"
          autoComplete="name"
          value={nome}
          onChange={(e) => definirNome(e.target.value)}
          aria-invalid={erroDoNome !== null}
        />
        {erroDoNome ? <span className="erro-campo">{erroDoNome}</span> : null}
      </div>
      <div className="field">
        <label className="label" htmlFor="senha">
          Senha
        </label>
        <input
          id="senha"
          className="input"
          type="password"
          autoComplete="new-password"
          value={senha}
          onChange={(e) => definirSenha(e.target.value)}
          aria-invalid={erroDaSenha !== null}
        />
        <span className="hint">Mínimo de {TAMANHO_MINIMO_DA_SENHA} caracteres.</span>
        {erroDaSenha ? <span className="erro-campo">{erroDaSenha}</span> : null}
      </div>
      {erroGeral ? <Alerta tipo="error">{erroGeral}</Alerta> : null}
      <button
        type="submit"
        className="btn btn-cta"
        disabled={enviando}
        style={{ width: "100%", marginTop: "var(--esp-3)" }}
      >
        {enviando ? "Entrando..." : "Aceitar convite"}
      </button>
    </form>
  );
};

const PaginaDeConvite = () => (
  <main className="login-pagina">
    <div className="card login-cartao pilha">
      <div>
        <div className="login-marca">BASTION</div>
        <p className="texto-2">Você foi convidado para uma organização. Defina seu nome e sua senha.</p>
      </div>
      <Suspense fallback={<p className="texto-2">Carregando...</p>}>
        <FormularioDeConvite />
      </Suspense>
    </div>
  </main>
);

export default PaginaDeConvite;
