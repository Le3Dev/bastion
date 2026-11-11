"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Alerta } from "@/componentes/Alerta";
import { entrar } from "@/prototipo/armazem";
import { mensagemDeErro } from "@/prototipo/erros";

const PaginaDeLogin = () => {
  const roteador = useRouter();
  const [email, definirEmail] = useState("");
  const [senha, definirSenha] = useState("");
  const [erroDeEmail, definirErroDeEmail] = useState<string | null>(null);
  const [erroDeSenha, definirErroDeSenha] = useState<string | null>(null);
  const [erroGeral, definirErroGeral] = useState<string | null>(null);

  const aoEnviar = (evento: FormEvent<HTMLFormElement>): void => {
    evento.preventDefault();
    definirErroGeral(null);
    const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    definirErroDeEmail(emailValido ? null : "Informe um e-mail válido.");
    definirErroDeSenha(senha.trim().length > 0 ? null : "Informe a senha.");
    if (!emailValido || senha.trim().length === 0) return;
    try {
      entrar(email, senha);
      roteador.push("/painel");
    } catch (erro) {
      definirErroGeral(mensagemDeErro(erro));
    }
  };

  return (
    <main className="login-pagina">
      <div className="card login-cartao pilha">
        <div>
          <div className="login-marca">BASTION</div>
          <p className="texto-2">Avaliação de segurança contínua e autorizada.</p>
        </div>
        <Alerta tipo="info">
          Protótipo navegável: use qualquer e-mail e senha; os dados são fictícios e ficam só na memória do navegador.
        </Alerta>
        <form onSubmit={aoEnviar} noValidate>
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
          <button type="submit" className="btn btn-cta" style={{ width: "100%", marginTop: "var(--esp-3)" }}>
            Entrar
          </button>
        </form>
      </div>
    </main>
  );
};

export default PaginaDeLogin;
