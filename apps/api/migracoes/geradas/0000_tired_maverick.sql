CREATE TABLE "chaves_de_api" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacao_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"prefixo" text NOT NULL,
	"hash_do_segredo" text NOT NULL,
	"papel" text NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_uso_em" timestamp with time zone,
	"revogada_em" timestamp with time zone,
	CONSTRAINT "chaves_de_api_prefixo_unique" UNIQUE("prefixo"),
	CONSTRAINT "chaves_de_api_hash_do_segredo_unique" UNIQUE("hash_do_segredo")
);
--> statement-breakpoint
CREATE TABLE "entregas_de_webhook" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacao_id" uuid NOT NULL,
	"webhook_id" uuid NOT NULL,
	"evento_id" uuid NOT NULL,
	"tipo_do_evento" text NOT NULL,
	"estado" text NOT NULL,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"ultimo_status" integer,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizada_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membros" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacao_id" uuid NOT NULL,
	"usuario_id" uuid,
	"email" text NOT NULL,
	"nome" text,
	"papel" text NOT NULL,
	"estado" text NOT NULL,
	"hash_do_token_de_convite" text,
	"desde" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membros_organizacao_email_unico" UNIQUE("organizacao_id","email")
);
--> statement-breakpoint
CREATE TABLE "organizacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"plano" text DEFAULT 'PROFISSIONAL' NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hash_do_token" text NOT NULL,
	"usuario_id" uuid NOT NULL,
	"organizacao_id" uuid NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"ultimo_uso_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessoes_hash_do_token_unique" UNIQUE("hash_do_token")
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"nome" text NOT NULL,
	"hash_da_senha" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacao_id" uuid NOT NULL,
	"url" text NOT NULL,
	"eventos" text[] NOT NULL,
	"segredo" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_envio_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sistemas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacao_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"tipo" text NOT NULL,
	"url_de_homologacao" text NOT NULL,
	"host_de_homologacao" text NOT NULL,
	"dominio_de_producao" text NOT NULL,
	"verificacao_metodo" text NOT NULL,
	"verificacao_token" text NOT NULL,
	"verificacao_estado" text NOT NULL,
	"verificacao_verificada_em" timestamp with time zone,
	"verificacao_expira_em" timestamp with time zone,
	"verificacao_mensagem" text,
	"ultima_nota" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "avaliacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacao_id" uuid NOT NULL,
	"sistema_id" uuid NOT NULL,
	"perfil" text NOT NULL,
	"origem" text NOT NULL,
	"estado" text NOT NULL,
	"nota_minima" integer NOT NULL,
	"nota" integer,
	"solicitada_por" text NOT NULL,
	"solicitada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"iniciada_em" timestamp with time zone,
	"estado_desde" timestamp with time zone DEFAULT now() NOT NULL,
	"concluida_em" timestamp with time zone,
	"motivo_da_falha" text,
	"achado_revalidado_id" uuid
);
--> statement-breakpoint
CREATE TABLE "etapas_da_avaliacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacao_id" uuid NOT NULL,
	"avaliacao_id" uuid NOT NULL,
	"ordem" integer NOT NULL,
	"nome" text NOT NULL,
	"estado" text NOT NULL,
	"progresso" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "etapas_da_avaliacao_ordem_unica" UNIQUE("avaliacao_id","ordem")
);
--> statement-breakpoint
CREATE TABLE "requisicoes_do_guardiao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacao_id" uuid NOT NULL,
	"avaliacao_id" uuid NOT NULL,
	"em" timestamp with time zone DEFAULT now() NOT NULL,
	"metodo" text NOT NULL,
	"url" text NOT NULL,
	"decisao" text NOT NULL,
	"motivo" text NOT NULL,
	"status" integer
);
--> statement-breakpoint
CREATE TABLE "achados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacao_id" uuid NOT NULL,
	"sistema_id" uuid NOT NULL,
	"impressao_digital" text NOT NULL,
	"tipo" text NOT NULL,
	"titulo" text NOT NULL,
	"severidade" text NOT NULL,
	"estado" text NOT NULL,
	"local" text NOT NULL,
	"descricao" text NOT NULL,
	"evidencia" jsonb NOT NULL,
	"correcao_sugerida" text NOT NULL,
	"conformidade" jsonb NOT NULL,
	"ocorrencias" integer DEFAULT 1 NOT NULL,
	"primeira_vez_em" timestamp with time zone NOT NULL,
	"ultima_vez_em" timestamp with time zone NOT NULL,
	"risco_aceito" jsonb,
	CONSTRAINT "achados_impressao_digital_unica" UNIQUE("organizacao_id","impressao_digital")
);
--> statement-breakpoint
CREATE TABLE "historico_do_achado" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacao_id" uuid NOT NULL,
	"achado_id" uuid NOT NULL,
	"em" timestamp with time zone DEFAULT now() NOT NULL,
	"de" text,
	"para" text NOT NULL,
	"ator" text NOT NULL,
	"comentario" text
);
--> statement-breakpoint
CREATE TABLE "ocorrencias_do_achado" (
	"organizacao_id" uuid NOT NULL,
	"achado_id" uuid NOT NULL,
	"avaliacao_id" uuid NOT NULL,
	"em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ocorrencias_do_achado_achado_id_avaliacao_id_pk" PRIMARY KEY("achado_id","avaliacao_id")
);
--> statement-breakpoint
CREATE TABLE "relatorios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacao_id" uuid NOT NULL,
	"avaliacao_id" uuid NOT NULL,
	"sistema_id" uuid NOT NULL,
	"gerado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"nota" integer NOT NULL,
	"resumo" text NOT NULL,
	"chave_do_pdf" text,
	CONSTRAINT "relatorios_avaliacao_id_unique" UNIQUE("avaliacao_id")
);
--> statement-breakpoint
CREATE TABLE "registros_de_auditoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacao_id" uuid NOT NULL,
	"em" timestamp with time zone DEFAULT now() NOT NULL,
	"ator_tipo" text NOT NULL,
	"ator_id" uuid,
	"ator_nome" text NOT NULL,
	"acao" text NOT NULL,
	"alvo" text NOT NULL,
	"detalhe" jsonb
);
--> statement-breakpoint
CREATE TABLE "eventos_de_saida" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacao_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"dados" jsonb NOT NULL,
	"ocorrido_em" timestamp with time zone DEFAULT now() NOT NULL,
	"publicado_em" timestamp with time zone,
	"tentativas" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eventos_processados" (
	"id_do_evento" uuid PRIMARY KEY NOT NULL,
	"processado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chaves_de_api" ADD CONSTRAINT "chaves_de_api_organizacao_id_organizacoes_id_fk" FOREIGN KEY ("organizacao_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entregas_de_webhook" ADD CONSTRAINT "entregas_de_webhook_organizacao_id_organizacoes_id_fk" FOREIGN KEY ("organizacao_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entregas_de_webhook" ADD CONSTRAINT "entregas_de_webhook_webhook_id_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."webhooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membros" ADD CONSTRAINT "membros_organizacao_id_organizacoes_id_fk" FOREIGN KEY ("organizacao_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membros" ADD CONSTRAINT "membros_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_organizacao_id_organizacoes_id_fk" FOREIGN KEY ("organizacao_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_organizacao_id_organizacoes_id_fk" FOREIGN KEY ("organizacao_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sistemas" ADD CONSTRAINT "sistemas_organizacao_id_organizacoes_id_fk" FOREIGN KEY ("organizacao_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avaliacoes" ADD CONSTRAINT "avaliacoes_organizacao_id_organizacoes_id_fk" FOREIGN KEY ("organizacao_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avaliacoes" ADD CONSTRAINT "avaliacoes_sistema_id_sistemas_id_fk" FOREIGN KEY ("sistema_id") REFERENCES "public"."sistemas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "etapas_da_avaliacao" ADD CONSTRAINT "etapas_da_avaliacao_organizacao_id_organizacoes_id_fk" FOREIGN KEY ("organizacao_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "etapas_da_avaliacao" ADD CONSTRAINT "etapas_da_avaliacao_avaliacao_id_avaliacoes_id_fk" FOREIGN KEY ("avaliacao_id") REFERENCES "public"."avaliacoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisicoes_do_guardiao" ADD CONSTRAINT "requisicoes_do_guardiao_organizacao_id_organizacoes_id_fk" FOREIGN KEY ("organizacao_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisicoes_do_guardiao" ADD CONSTRAINT "requisicoes_do_guardiao_avaliacao_id_avaliacoes_id_fk" FOREIGN KEY ("avaliacao_id") REFERENCES "public"."avaliacoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achados" ADD CONSTRAINT "achados_organizacao_id_organizacoes_id_fk" FOREIGN KEY ("organizacao_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achados" ADD CONSTRAINT "achados_sistema_id_sistemas_id_fk" FOREIGN KEY ("sistema_id") REFERENCES "public"."sistemas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historico_do_achado" ADD CONSTRAINT "historico_do_achado_organizacao_id_organizacoes_id_fk" FOREIGN KEY ("organizacao_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historico_do_achado" ADD CONSTRAINT "historico_do_achado_achado_id_achados_id_fk" FOREIGN KEY ("achado_id") REFERENCES "public"."achados"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ocorrencias_do_achado" ADD CONSTRAINT "ocorrencias_do_achado_organizacao_id_organizacoes_id_fk" FOREIGN KEY ("organizacao_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ocorrencias_do_achado" ADD CONSTRAINT "ocorrencias_do_achado_achado_id_achados_id_fk" FOREIGN KEY ("achado_id") REFERENCES "public"."achados"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ocorrencias_do_achado" ADD CONSTRAINT "ocorrencias_do_achado_avaliacao_id_avaliacoes_id_fk" FOREIGN KEY ("avaliacao_id") REFERENCES "public"."avaliacoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relatorios" ADD CONSTRAINT "relatorios_organizacao_id_organizacoes_id_fk" FOREIGN KEY ("organizacao_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relatorios" ADD CONSTRAINT "relatorios_avaliacao_id_avaliacoes_id_fk" FOREIGN KEY ("avaliacao_id") REFERENCES "public"."avaliacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relatorios" ADD CONSTRAINT "relatorios_sistema_id_sistemas_id_fk" FOREIGN KEY ("sistema_id") REFERENCES "public"."sistemas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registros_de_auditoria" ADD CONSTRAINT "registros_de_auditoria_organizacao_id_organizacoes_id_fk" FOREIGN KEY ("organizacao_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chaves_de_api_organizacao_idx" ON "chaves_de_api" USING btree ("organizacao_id");--> statement-breakpoint
CREATE INDEX "entregas_de_webhook_organizacao_idx" ON "entregas_de_webhook" USING btree ("organizacao_id","criada_em" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "entregas_de_webhook_webhook_idx" ON "entregas_de_webhook" USING btree ("webhook_id");--> statement-breakpoint
CREATE INDEX "membros_usuario_idx" ON "membros" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "sessoes_usuario_idx" ON "sessoes" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "webhooks_organizacao_idx" ON "webhooks" USING btree ("organizacao_id");--> statement-breakpoint
CREATE INDEX "sistemas_organizacao_idx" ON "sistemas" USING btree ("organizacao_id","criado_em" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "avaliacoes_organizacao_solicitada_idx" ON "avaliacoes" USING btree ("organizacao_id","solicitada_em" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "avaliacoes_sistema_idx" ON "avaliacoes" USING btree ("sistema_id");--> statement-breakpoint
CREATE INDEX "requisicoes_do_guardiao_avaliacao_idx" ON "requisicoes_do_guardiao" USING btree ("avaliacao_id","em");--> statement-breakpoint
CREATE INDEX "achados_organizacao_estado_idx" ON "achados" USING btree ("organizacao_id","estado");--> statement-breakpoint
CREATE INDEX "achados_sistema_idx" ON "achados" USING btree ("sistema_id");--> statement-breakpoint
CREATE INDEX "historico_do_achado_achado_idx" ON "historico_do_achado" USING btree ("achado_id","em");--> statement-breakpoint
CREATE INDEX "ocorrencias_do_achado_avaliacao_idx" ON "ocorrencias_do_achado" USING btree ("avaliacao_id");--> statement-breakpoint
CREATE INDEX "relatorios_organizacao_idx" ON "relatorios" USING btree ("organizacao_id","gerado_em" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "registros_de_auditoria_organizacao_idx" ON "registros_de_auditoria" USING btree ("organizacao_id","em" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "eventos_de_saida_pendentes_idx" ON "eventos_de_saida" USING btree ("ocorrido_em") WHERE "eventos_de_saida"."publicado_em" is null;