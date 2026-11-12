import { PainelDto } from "@bastion/contratos";
import { requisitar } from "./cliente";

export const obterPainel = (sinal?: AbortSignal): Promise<PainelDto> => requisitar("/v1/painel", { esquema: PainelDto, sinal });
