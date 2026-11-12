"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { mensagemDoErro } from "@/api/cliente";
import { cadastrarOrganizacao } from "@/api/contas";
import { Alerta } from "@/componentes/Alerta";

const TAMANHO_MINIMO_DA_SENHA = 12;

interface Erros {
  nomeDaOrganizacao?: string;
  nome?: string;
  email?: string;
  senha?: string;
  confirmacao?: string;
}

const PaginaDeCadastro = () => {
  const roteador = useRouter();
  const [nomeDaOrganizacao, definirNomeDaOrganizacao] = useState("");
  const [nome, definirNome] = useState("");
  const [email, definirEmail] = useState("");
  const [senha, definirSenha] = useState("");
  const [confirmacao, definirConfirmacao] = useState("");
  const [erros, definirErros] = useState<Erros>({});
  const [erroGeral, definirErroGeral] = useState<string | null>(null);
  const [enviando, definirEnviando] = useState(false);

  const aoEnviar = async (evento: FormEvent<HTMLFormElement>): Promise<void> => {
    evento.preventDefault();
    definirErroGeral(null);
    const encontrados: Erros = {};
    if (nomeDaOrganizacao.trim().length === 0) encontrados.nomeDaOrganizacao = "Informe o nome da organização.";
    if (nome.trim().length === 0) encontrados.nome = "Informe seu nome.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) encontrados.email = "Informe um e-mail válido.";
    if (senha.length < TAMANHO_MINIMO_DA_SENHA) {
      encontrados.senha = `A senha precisa ter ao menos ${TAMANHO_MINIMO_DA_SENHA} caracteres.`;
    }
    if (confirmacao !== senha) encontrados.confirmacao = "A confirmação não confere com a senha.";
    definirErros(encontrados);
    if (Object.keys(encontrados).length > 0) return;
    definirEnviando(true);
    try {
      await cadastrarOrganizacao({
        nomeDaOrganizacao: nomeDaOrganizacao.trim(),
        nome: nome.trim(),
        email: email.trim(),
        senha,
      });
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
          <p className="texto-2">Crie sua organização e comece a avaliar sistemas autorizados.</p>
        </div>
        <form onSubmit={(e) => void aoEnviar(e)} noValidate>
          <div className="field">
            <label className="label" htmlFor="organizacao">
              Nome da organização
            </label>
            <input
              id="organizacao"
              className="input"
              autoComplete="organization"
              value={nomeDaOrganizacao}
              onChange={(e) => definirNomeDaOrganizacao(e.target.value)}
              aria-invalid={erros.nomeDaOrganizacao !== undefined}
            />
            {erros.nomeDaOrganizacao ? <span className="erro-campo">{erros.nomeDaOrganizacao}</span> : null}
          </div>
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
              aria-invalid={erros.nome !== undefined}
            />
            {erros.nome ? <span className="erro-campo">{erros.nome}</span> : null}
          </div>
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
              aria-invalid={erros.email !== undefined}
            />
            {erros.email ? <span className="erro-campo">{erros.email}</span> : null}
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
              aria-invalid={erros.senha !== undefined}
            />
            <span className="hint">Mínimo de {TAMANHO_MINIMO_DA_SENHA} caracteres.</span>
            {erros.senha ? <span className="erro-campo">{erros.senha}</span> : null}
          </div>
          <div className="field">
            <label className="label" htmlFor="confirmacao">
              Confirme a senha
            </label>
            <input
              id="confirmacao"
              className="input"
              type="password"
              autoComplete="new-password"
              value={confirmacao}
              onChange={(e) => definirConfirmacao(e.target.value)}
              aria-invalid={erros.confirmacao !== undefined}
            />
            {erros.confirmacao ? <span className="erro-campo">{erros.confirmacao}</span> : null}
          </div>
          {erroGeral ? <Alerta tipo="error">{erroGeral}</Alerta> : null}
          <button
            type="submit"
            className="btn btn-cta"
            disabled={enviando}
            style={{ width: "100%", marginTop: "var(--esp-3)" }}
          >
            {enviando ? "Criando..." : "Criar organização"}
          </button>
        </form>
        <p className="texto-2">
          Já tem conta? <Link href="/login">Entrar</Link>
        </p>
      </div>
    </main>
  );
};

export default PaginaDeCadastro;
