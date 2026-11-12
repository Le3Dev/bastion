import { conformidade, type Constatacao, type DadosDoTls } from './tipos';

const DIA_EM_MS = 24 * 60 * 60 * 1000;
const LIMITE_DE_EXPIRACAO_EM_DIAS = 30;
const PROTOCOLOS_OBSOLETOS = ['TLSv1', 'TLSv1.1'];

const CORRECAO_DE_PROTOCOLO =
  'Aceite apenas TLS 1.2 e 1.3.\n\nnginx:\nssl_protocols TLSv1.2 TLSv1.3;\n\nExpress (https.createServer):\nhttps.createServer({ minVersion: \'TLSv1.2\', key, cert }, app);';

const CORRECAO_DE_CERTIFICADO =
  'Emita um certificado válido (por exemplo, com Let\'s Encrypt) e automatize a renovação.\n\nnginx:\nssl_certificate /etc/letsencrypt/live/<host>/fullchain.pem;\nssl_certificate_key /etc/letsencrypt/live/<host>/privkey.pem;\n\nExpress (https.createServer):\nhttps.createServer({ key: readFileSync(chave), cert: readFileSync(cadeiaCompleta) }, app);';

const formatarData = (data: Date): string => data.toISOString().slice(0, 10);

export function analisarTls(dados: DadosDoTls, agora: Date): Constatacao[] {
  const constatacoes: Constatacao[] = [];
  const requisicao = `TLS ${dados.host}:443`;

  for (const protocolo of PROTOCOLOS_OBSOLETOS) {
    if (dados.protocolosAceitos.includes(protocolo)) {
      constatacoes.push({
        tipo: 'TLS_VERSAO_OBSOLETA',
        titulo: `Servidor aceita o protocolo obsoleto ${protocolo}`,
        severidade: 'ALTA',
        local: `tls:protocolo:${protocolo}`,
        descricao: `O servidor aceita conexões com ${protocolo}, versão com fraquezas conhecidas e descontinuada pelos navegadores.`,
        evidencia: {
          requisicao,
          resposta: `Protocolos aceitos: ${dados.protocolosAceitos.join(', ')}`,
          observacao: `A negociação com ${protocolo} foi concluída com sucesso.`,
        },
        correcaoSugerida: CORRECAO_DE_PROTOCOLO,
        conformidade: conformidade(true),
      });
    }
  }

  const certificado = dados.certificado;
  if (certificado === null) return constatacoes;

  const resposta = `Sujeito: ${certificado.sujeito}\nEmissor: ${certificado.emissor}\nVálido de ${formatarData(certificado.validoDe)} até ${formatarData(certificado.validoAte)}`;
  const restanteEmMs = certificado.validoAte.getTime() - agora.getTime();

  if (restanteEmMs <= 0) {
    constatacoes.push({
      tipo: 'TLS_CERTIFICADO_EXPIRADO',
      titulo: 'Certificado TLS expirado',
      severidade: 'CRITICA',
      local: 'tls:certificado',
      descricao: 'O certificado do servidor expirou. Navegadores exibem alertas de segurança e as conexões não são confiáveis.',
      evidencia: {
        requisicao,
        resposta,
        observacao: `O certificado expirou em ${formatarData(certificado.validoAte)}.`,
      },
      correcaoSugerida: CORRECAO_DE_CERTIFICADO,
      conformidade: conformidade(true),
    });
  } else if (restanteEmMs < LIMITE_DE_EXPIRACAO_EM_DIAS * DIA_EM_MS) {
    const dias = Math.ceil(restanteEmMs / DIA_EM_MS);
    constatacoes.push({
      tipo: 'TLS_CERTIFICADO_EXPIRANDO',
      titulo: 'Certificado TLS próximo da expiração',
      severidade: 'ALTA',
      local: 'tls:certificado',
      descricao: `O certificado do servidor expira em menos de ${LIMITE_DE_EXPIRACAO_EM_DIAS} dias. Se não for renovado, o site ficará inacessível com segurança.`,
      evidencia: {
        requisicao,
        resposta,
        observacao: `Faltam ${dias} dia(s) para a expiração, em ${formatarData(certificado.validoAte)}.`,
      },
      correcaoSugerida: CORRECAO_DE_CERTIFICADO,
      conformidade: conformidade(true),
    });
  }

  if (!certificado.confiavel) {
    const motivo = certificado.motivoDaDesconfianca ?? 'motivo não informado';
    constatacoes.push({
      tipo: 'TLS_CERTIFICADO_NAO_CONFIAVEL',
      titulo: 'Certificado TLS não confiável',
      severidade: 'ALTA',
      local: 'tls:certificado',
      descricao: `O certificado do servidor não é confiável (${motivo}). Os navegadores bloqueiam ou alertam o usuário.`,
      evidencia: { requisicao, resposta, observacao: `Motivo da desconfiança: ${motivo}.` },
      correcaoSugerida: CORRECAO_DE_CERTIFICADO,
      conformidade: conformidade(true),
    });
  }

  if (!certificado.nomeConfere) {
    constatacoes.push({
      tipo: 'TLS_NOME_NAO_CONFERE',
      titulo: 'Nome do certificado TLS não confere com o host',
      severidade: 'ALTA',
      local: 'tls:certificado:nome',
      descricao: `O certificado apresentado não cobre o host ${dados.host}. Os navegadores exibem um erro de nome inválido.`,
      evidencia: {
        requisicao,
        resposta,
        observacao: `O sujeito "${certificado.sujeito}" não corresponde a ${dados.host}.`,
      },
      correcaoSugerida: CORRECAO_DE_CERTIFICADO,
      conformidade: conformidade(true),
    });
  }

  return constatacoes;
}
