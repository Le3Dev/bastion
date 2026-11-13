CREATE TABLE "agendamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacao_id" uuid NOT NULL,
	"sistema_id" uuid NOT NULL,
	"perfil" text NOT NULL,
	"nota_minima" integer NOT NULL,
	"frequencia" text NOT NULL,
	"horario" text NOT NULL,
	"dia_da_semana" integer,
	"dia_do_mes" integer,
	"autorizacao" jsonb,
	"permitir_criacao_de_dados" boolean DEFAULT false NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_organizacao_id_organizacoes_id_fk" FOREIGN KEY ("organizacao_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_sistema_id_sistemas_id_fk" FOREIGN KEY ("sistema_id") REFERENCES "public"."sistemas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agendamentos_organizacao_idx" ON "agendamentos" USING btree ("organizacao_id");