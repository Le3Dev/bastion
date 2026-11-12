"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { mensagemDoErro } from "@/api/cliente";
import { entrar } from "@/api/contas";
import { Alerta } from "@/componentes/Alerta";

const PaginaDeLogin = () => {
  const roteador = useRouter();
  const [email, definirEmail] = useState("");
  const [senha, definirSenha] = useState("");
  const [erroDeEmail, definirErroDeEmail] = useState<string | null>(null);
  const [erroDeSenha, definirErroDeSenha] = useState<string | null>(null);
  const [erroGeral, definirErroGeral] = useState<string | null>(null);
  const [enviando, definirEnviando] = useState(false);

  const aoEnviar = async (evento: FormEvent<HTMLFormElement>): Promise<void> => {
    evento.preventDefault();
    definirErroGeral(null);
    const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    definirErroDeEmail(emailValido ? null : "Informe um e-mail válido.");
    definirErroDeSenha(senha.length > 0 ? null : "Informe a senha.");
    if (!emailValido || senha.length === 0) return;
    definirEnviando(true);
    try {
      await entrar({ email: email.trim(), senha });
      roteador.push("/painel");
    } catch (erro) {
      definirErroGeral(mensagemDoErro(erro));
      definirEnviando(false);
    }
  };

  return (
    <main className="login-pagina">
      <div className="card login-cartao pilha">
        <div>
          <div className="login-marca">BASTION</div>
          <p className="texto-2">Avaliação de segurança contínua e autorizada.</p>
        </div>
        <form onSubmit={(e) => void aoEnviar(e)} noValidate>
          <div className="field">
            <label className="label" htmlFor="email">
              E-mail
            </label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => definirEmail(e.target.value)}
              aria-invalid={erroDeEmail !== null}
            />
            {erroDeEmail ? <span className="erro-campo">{erroDeEmail}</span> : null}
          </div>
          <div className="field">
            <label className="label" htmlFor="senha">
              Senha
            </label>
            <input
              id="senha"
              className="input"
              type="password"
              autoComplete="current-password"
              value={senha}
              onChange={(e) => definirSenha(e.target.value)}
              aria-invalid={erroDeSenha !== null}
            />
            {erroDeSenha ? <span className="erro-campo">{erroDeSenha}</span> : null}
          </div>
          {erroGeral ? <Alerta tipo="error">{erroGeral}</Alerta> : null}
          <button
            type="submit"
            className="btn btn-cta"
            disabled={enviando}
            style={{ width: "100%", marginTop: "var(--esp-3)" }}
          >
            {enviando ? "Entrando..." : "Entrar"}
          </button>
        </form>
        <p className="texto-2">
          Ainda não tem conta? <Link href="/cadastro">Criar organização</Link>
        </p>
      </div>
    </main>
  );
};

export default PaginaDeLogin;
