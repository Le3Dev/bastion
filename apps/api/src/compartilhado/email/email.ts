import nodemailer from 'nodemailer';
import type { ConfigDeEmail } from '../config';

export interface MensagemDeEmail {
  para: string;
  assunto: string;
  html: string;
  texto: string;
}

export interface ResultadoDeEnvio {
  enviado: boolean;
  motivo?: string;
}

export interface ServicoDeEmail {
  enviar(msg: MensagemDeEmail): Promise<ResultadoDeEnvio>;
}

/** Cria o serviço de e-mail. Sem configuração (sem host), vira no-op. Nunca lança ao enviar. */
export const criarServicoDeEmail = (
  config: ConfigDeEmail | null | undefined,
  registrar: (mensagem: string) => void = (mensagem) => console.warn(mensagem),
): ServicoDeEmail => {
  if (!config || config.host.trim() === '') {
    return {
      enviar: async () => {
        registrar('e-mail não configurado; pulando envio');
        return { enviado: false, motivo: 'SMTP não configurado' };
      },
    };
  }
  const transporte = nodemailer.createTransport({
    host: config.host,
    port: config.porta,
    secure: config.seguro,
    ...(config.usuario !== undefined && config.senha !== undefined
      ? { auth: { user: config.usuario, pass: config.senha } }
      : {}),
  });
  return {
    enviar: async (msg) => {
      try {
        await transporte.sendMail({
          from: config.remetente,
          to: msg.para,
          subject: msg.assunto,
          html: msg.html,
          text: msg.texto,
        });
        return { enviado: true };
      } catch (erro) {
        const motivo = erro instanceof Error ? erro.message : 'falha desconhecida no envio';
        registrar(`Falha ao enviar e-mail: ${motivo}`);
        return { enviado: false, motivo };
      }
    },
  };
};

const escaparHtml = (valor: string): string =>
  valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export interface DadosDoConvite {
  nomeDaOrganizacao: string;
  papel: string;
  linkDoConvite: string;
}

export const montarEmailDeConvite = (
  dados: DadosDoConvite,
): { assunto: string; html: string; texto: string } => {
  const { nomeDaOrganizacao, papel, linkDoConvite } = dados;
  const assunto = `Convite para participar de ${nomeDaOrganizacao} no Bastion`;
  const texto = [
    'Olá,',
    '',
    `Você foi convidado(a) para participar da organização "${nomeDaOrganizacao}" no Bastion, com o papel de ${papel}.`,
    '',
    'Para aceitar o convite, acesse o link abaixo:',
    linkDoConvite,
    '',
    'Se você não esperava este convite, ignore esta mensagem.',
  ].join('\n');
  const html = `<!doctype html>
<html lang="pt-BR"><body style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.5;">
<p>Olá,</p>
<p>Você foi convidado(a) para participar da organização <strong>${escaparHtml(nomeDaOrganizacao)}</strong> no Bastion, com o papel de <strong>${escaparHtml(papel)}</strong>.</p>
<p>Para aceitar o convite, acesse o link abaixo:</p>
<p><a href="${escaparHtml(linkDoConvite)}">${escaparHtml(linkDoConvite)}</a></p>
<p>Se você não esperava este convite, ignore esta mensagem.</p>
</body></html>`;
  return { assunto, html, texto };
};

export interface ServicoDeEmailFalso extends ServicoDeEmail {
  readonly enviadas: MensagemDeEmail[];
}

/** Para testes: guarda as mensagens enviadas e sempre retorna sucesso. */
export const criarServicoDeEmailFalso = (): ServicoDeEmailFalso => {
  const enviadas: MensagemDeEmail[] = [];
  return {
    enviadas,
    enviar: async (msg) => {
      enviadas.push(msg);
      return { enviado: true };
    },
  };
};
