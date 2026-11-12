ALTER TABLE "sistemas" ADD COLUMN "credencial_de_teste" jsonb;--> statement-breakpoint
ALTER TABLE "sistemas" ADD COLUMN "conector_de_ia" jsonb;--> statement-breakpoint
ALTER TABLE "sistemas" ADD COLUMN "permitir_criacao_de_dados_de_teste" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "avaliacoes" ADD COLUMN "autorizacao" jsonb;--> statement-breakpoint
ALTER TABLE "avaliacoes" ADD COLUMN "permitir_criacao_de_dados" boolean DEFAULT false NOT NULL;