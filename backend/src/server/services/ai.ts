import { FlowConfig, StorePreset, Message } from "../../types.ts";
import { getOpenAIClient, getGeminiClient } from "../config.ts";
import { getHumanizedPrompt } from "../agentSkills.ts";

/**
 * Classifies the lead's speech to find out if it requires immediate human assistance.
 */
export async function classifyLeadIntent(userMessage: string, escalationKeywords?: string[]): Promise<"cotacao" | "contato" | "venda_humana"> {
  const lower = userMessage.toLowerCase().trim();

  // Keyword optimization using user-configured settings
  const keywords = escalationKeywords && escalationKeywords.length > 0
    ? escalationKeywords
    : ["comprar", "fechar", "quanto fica", "pix", "atendente", "humano", "boleto", "cartao", "cartão", "desconto", "falar com pessoa", "vendedor", "finalizar", "preco", "preço", "tenho interesse", "qual o valor", "interesse", "valor", "valores", "quanto é", "quanto custa"];

  if (keywords.some(kw => lower.includes(kw.toLowerCase().trim()))) {
    return "venda_humana";
  }

  // 1. Tenta Gemini primeiro (Requisito 1)
  const gemini = getGeminiClient();
  if (gemini) {
    try {
      const model = "gemini-3.5-flash";
      const contents = `Você é um classificador de intenção de clientes em uma loja de autopeças de Itabuna BA. Classifique as intenções do cliente exatamente com um de 3 termos: 'cotacao', 'contato' ou 'venda_humana'.

cotacao: o usuário quer cotar peças, saber marcas, mecânica básica.
contato: o usuário busca endereço, telefone, contato.
venda_humana: o usuário expressa pressa, pedido de desconto, quer fechar preço, quer link ou Pix para pagar, quer falar com um vendedor humano, expressa real interesse em comprar, ou usa algum dos seguintes gatilhos de escalação: ${keywords.join(", ")}.

Cliente: "${userMessage}"

Retorne apenas uma das três palavras-chave exatas.`;

      const response = await gemini.models.generateContent({
        model,
        contents,
        config: {
          temperature: 0.1,
        }
      });
      const res = response.text?.trim()?.toLowerCase() || "cotacao";
      console.log(`[AI Classification] Gemini Result: "${res}"`);
      if (res.includes("venda_humana")) return "venda_humana";
      if (res.includes("contato")) return "contato";
      return "cotacao";
    } catch (e) {
      console.error("[AI Service] Falha na classificação por Gemini (migrando para OpenAI fallback):", e);
    }
  }

  // 2. OpenAI Fallback (Requisito 2)
  const openai = getOpenAIClient();
  if (openai) {
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { 
            role: "system", 
            content: `Você é um classificador de intenção de clientes em uma loja de autopeças de Itabuna BA. Classifique as intenções do cliente exatamente com um de 3 termos: 'cotacao', 'contato' ou 'venda_humana'.

cotacao: o usuário quer cotar peças, saber marcas, mecânica básica.
contato: o usuário busca endereço, telefone, contato.
venda_humana: o usuário expressa pressa, pedido de desconto, quer fechar preço, quer link ou Pix para pagar, quer falar com um vendedor humano, expressa real interesse em comprar, ou usa algum dos seguintes gatilhos: ${keywords.join(", ")}.` 
          },
          { role: "user", content: userMessage }
        ],
        temperature: 0.1,
        max_tokens: 15
      });
      const res = completion.choices[0]?.message?.content?.trim()?.toLowerCase() || "cotacao";
      console.log(`[AI Classification] OpenAI Fallback Result: "${res}"`);
      if (res.includes("venda_humana")) return "venda_humana";
      if (res.includes("contato")) return "contato";
      return "cotacao";
    } catch (e) {
      console.error("[AI Service] Falha na classificação por OpenAI:", e);
    }
  }

  return "cotacao";
}

/**
 * Simulates a direct local reply, providing excellent reliability if credentials are off.
 */
export function simulateLocalDialog(msg: string, store: StorePreset): string {
  const lower = msg.toLowerCase();
  if (lower.includes("freio") || lower.includes("pastilha")) {
    return `Sim, amigo! Temos as pastilhas para seu veículo disponíveis no estoque da filial **${store.name}**! Trabalhamos com pastilhas Bosch por preços a partir de R$ 139,00 e Fras-le com altíssima durabilidade. Deseja que eu verifique a compatibilidade exata pelo chassi ou ano do seu carro?`;
  }
  if (lower.includes("amortecedor") || lower.includes("suspens") || lower.includes("mola")) {
    return `Olá! Nós temos amortecedores originais Cofap e Monroe de primeira linha, com garantia de 2 anos aqui na **${store.name}**. O par de amortecedores dianteiros fica em média R$ 640,00 dependendo da cilindrada do modelo. Me informe o ano do carro para eu checar no sistema!`;
  }
  if (lower.includes("contato") || lower.includes("endereço") || lower.includes("onde fica") || lower.includes("localiza")) {
    return `Aqui estão os detalhes da nossa loja física **${store.name}**:\n📍 **${store.address}**\n📞 Telefone direto: ${store.phone}\n🕒 Horário operacional: ${store.workingHours}. Diga se planeja vir hoje!`;
  }
  return `Perfeito! Nós da **${store.name}** cobrimos orçamentos da concorrência de Itabuna BA e oferecemos garantia de procedência original das autopeças. Forneça o ano, motorização ou marcas preferidas para as peças do seu orçamento!`;
}

/**
 * Generates completion responses using Gemini (principal) with OpenAI fallback.
 */
export async function generateAIResponse(
  userMessage: string, 
  dialogHistory: string, 
  flowConfig: FlowConfig, 
  activeStore: StorePreset
): Promise<string> {
  const storeContext = `Loja: ${activeStore.name}.\nEndereço: ${activeStore.address}.\nTelefone: ${activeStore.phone}.\nHorários: ${activeStore.workingHours}.\nEspecialidades: ${activeStore.specialties.join(", ")}.\nDiferenciais: ${activeStore.features.join(", ")}.`;
  
  const systemPrompt = getHumanizedPrompt(flowConfig.aiSystemPrompt);

  // 1. Tenta Gemini (IA Principal) (Requisito 1)
  const gemini = getGeminiClient();
  if (gemini) {
    try {
      const model = "gemini-3.5-flash";
      const contents = `[HISTÓRICO DA CONVERSA RECENTE]\n${dialogHistory}\n\nMensagem recente do cliente: "${userMessage}".\n\nResponda diretamente com objetividade de balcão de peças com tom natural, amigável e focado.`;
      const response = await gemini.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: `${systemPrompt}\n\n[CONTEXTO DA FILIAL]\n${storeContext}`,
          temperature: 0.7,
        }
      });
      const text = response.text?.trim();
      if (text) {
        console.log("[AI Generation] Resposta gerada com sucesso via Gemini.");
        return text;
      }
    } catch (err) {
      console.error("[AI Service] Erro Gemini generateAIResponse (migrando para fallback OpenAI):", err);
    }
  }

  // 2. Tenta OpenAI (Fallback Automático) (Requisito 2)
  const openai = getOpenAIClient();
  if (openai) {
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: `${systemPrompt}\n\n[CONTEXTO DA FILIAL]\n${storeContext}` },
          { role: "user", content: `[HISTÓRICO DA CONVERSA RECENTE]\n${dialogHistory}\n\nMensagem recente do cliente: "${userMessage}".\n\nResponda diretamente com objetividade de balcão de peças.` }
        ],
        temperature: 0.7,
        max_tokens: 220
      });
      const text = completion.choices[0]?.message?.content?.trim();
      if (text) {
        console.log("[AI Generation] Resposta gerada via OpenAI de fallback.");
        return text;
      }
    } catch (err) {
      console.error("[AI Service] Erro OpenAI generateAIResponse de fallback:", err);
    }
  }

  console.warn("[AI Service] Todos os provedores de IA falharam/insuficientes. Usando sandbox offline para recuperação local.");
  return simulateLocalDialog(userMessage, activeStore);
}

/**
 * Builds dynamic conversation history for prompt injection.
 */
export function buildSmartContext(messagesList: Message[]): string {
  const recentHistory = messagesList.slice(-8);
  return recentHistory.map(m => {
    const label = m.role === "user" ? "Cliente" : m.role === "agent_human" ? "Atendente Humano" : "Assistente IA";
    return `${label}: ${m.text}`;
  }).join("\n");
}
