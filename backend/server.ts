import express, { Request, Response } from "express";
import path from "path";
import fs from "fs";
import { doc, setDoc, getDoc, updateDoc, getDocs, doc as dbDoc, collection, query, orderBy, limit } from "firebase/firestore";

// Types
import { AtendimentoMode, Message, Lead, StorePreset, FlowConfig, WebhookSimLog } from "./src/types.ts";

// Modular Imports (Tidy folder organization for startups)
import { STORES } from "./src/server/stores.ts";
import { db, firebaseActive } from "./src/server/config.ts";
import { sendWhatsAppMessage } from "./src/server/services/whatsapp.ts";
import { 
  classifyLeadIntent, 
  generateAIResponse, 
  buildSmartContext, 
  simulateLocalDialog 
} from "./src/server/services/ai.ts";

const app = express();
app.use(express.json());

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// Render environment: create a /health endpoint returning {"status": "ok"}
app.get("/health", (req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

// Global settings state
let globalFlowConfig: FlowConfig = {
  activeStoreId: "jal",
  optInText: "Olá! Seja bem-vindo à central de atendimento inteligente da Central Autocar. 🚗💨\n\nPor favor, confirme se deseja iniciar o atendimento tocando em um dos botões abaixo para que nossa inteligência de balcão possa te ajudar com preços e marcas com segurança e sem banimentos!",
  optInButtons: ["🔍 Fazer Cotação", "📍 Endereço / Contato", "⏳ Falar com Humano"],
  aiGreeting: "Perfeito! Obrigado por confirmar seu interesse. Eu sou o Assistente Virtual inteligente de peças da Central Autocar.\n\nComo posso te auxiliar com peças ou orçamentos hoje? Por favor, informe o modelo do veículo e o ano se possível!",
  aiSystemPrompt: "Você é o especialista de balcão de vendas inteligente de autopeças da Central Autocar em Itabuna BA. Domine peças, marcas, mecânica básica, atendimento amigável e regional.\n\nRegras cruciais de comunicação:\n1. NÃO fale mentiras sobre preços exatos se não souber. Peça para confirmar com o setor de vendas se o cliente insistir em fechar e diga que vai transferi-lo.\n2. Seja profissional, prestativo e utilize termos automobilísticos corretos.\n3. Sempre use português brasileiro nativo e cortês.\n4. Sempre que o cliente decidir comprar, fechar, perguntar sobre formas exatas de pagamento, pedir desconto crítico ou solicitar explicitamente um humano/vendedor, use termos que engajem a transição automática.",
  escalationKeywords: ["comprar", "fechar", "quanto fica", "pix", "atendente", "humano", "boleto", "cartao", "cartão", "desconto", "falar com pessoa", "vendedor", "finalizar", "compora", "preco", "preço", "orçamento fechado", "tenho interesse", "qual o valor", "interesse", "valor", "valores", "quanto é", "quanto custa"]
};

// Clean initial states for webhooks and leads in production
let localWebhookLogs: WebhookSimLog[] = [];
let localMessagesDb: Record<string, Message[]> = {};

let localLeads: Lead[] = [];

// High-load queue and deduplication engine for Render
interface QueuedMessage {
  senderPhone: string;
  text: string;
  isButton: boolean;
  isMockOnly: boolean;
  messageId: string;
}

const recentMetaMessageIds = new Set<string>();
const maxDeduplicationCacheSize = 1000;
const userMessageQueues: Record<string, QueuedMessage[]> = {};
const activeQueueWorkers = new Set<string>();

function enqueueIncomingMessage(msg: QueuedMessage) {
  const { senderPhone, messageId } = msg;

  if (messageId) {
    if (recentMetaMessageIds.has(messageId)) {
      console.log(`[Queue Engine] Ignorando webhook Meta duplicado: ${messageId}`);
      return;
    }
    recentMetaMessageIds.add(messageId);
    if (recentMetaMessageIds.size > maxDeduplicationCacheSize) {
      const firstVal = recentMetaMessageIds.values().next().value;
      if (firstVal !== undefined) recentMetaMessageIds.delete(firstVal);
    }
  }

  if (!userMessageQueues[senderPhone]) {
    userMessageQueues[senderPhone] = [];
  }
  userMessageQueues[senderPhone].push(msg);

  if (!activeQueueWorkers.has(senderPhone)) {
    activeQueueWorkers.add(senderPhone);
    processUserMessageQueue(senderPhone);
  }
}

async function processUserMessageQueue(senderPhone: string) {
  try {
    while (userMessageQueues[senderPhone] && userMessageQueues[senderPhone].length > 0) {
      const nextMsg = userMessageQueues[senderPhone].shift();
      if (!nextMsg) continue;

      try {
        console.log(`[Queue Engine] Processando msg sequencial para ${senderPhone}. Restam na fila: ${userMessageQueues[senderPhone].length}`);
        await handleWebhookIncomingMessage(nextMsg.senderPhone, nextMsg.text, nextMsg.isButton, nextMsg.isMockOnly);
      } catch (err) {
        console.error(`[Queue Engine Exception] Categoria Crítica em ${senderPhone}:`, err);
      }
    }
  } finally {
    activeQueueWorkers.delete(senderPhone);
  }
}

let localStats = {
  totalLeads: 0,
  aiHandled: 0,
  humanHandled: 0,
  conversationsSaved: 0,
  averageConfidence: 94,
  savedTokens: 0,
  responseTimeSavedSec: 0
};

// Real-time analytics tracking
async function incrementDashboardAnalytics(itemType: "leads" | "ai" | "human" | "saved") {
  if (!firebaseActive || !db) {
    if (itemType === "leads") localStats.totalLeads++;
    if (itemType === "ai") localStats.aiHandled++;
    if (itemType === "human") localStats.humanHandled++;
    if (itemType === "saved") {
      localStats.conversationsSaved++;
      localStats.savedTokens += 180;
      localStats.responseTimeSavedSec += 210;
    }
    return;
  }

  const analyticDocPath = "analytics/current";
  try {
    const docSnap = await getDoc(doc(db, analyticDocPath));
    const currentData = docSnap.exists() ? docSnap.data() : {
      totalLeads: 0,
      aiHandled: 0,
      humanHandled: 0,
      conversationsSaved: 0,
      averageConfidence: 94,
      savedTokens: 0,
      responseTimeSavedSec: 0
    };

    if (itemType === "leads") currentData.totalLeads = (currentData.totalLeads || 0) + 1;
    if (itemType === "ai") currentData.aiHandled = (currentData.aiHandled || 0) + 1;
    if (itemType === "human") currentData.humanHandled = (currentData.humanHandled || 0) + 1;
    if (itemType === "saved") {
      currentData.conversationsSaved = (currentData.conversationsSaved || 0) + 1;
      currentData.savedTokens = (currentData.savedTokens || 0) + 160;
      currentData.responseTimeSavedSec = (currentData.responseTimeSavedSec || 0) + 240;
    }

    await setDoc(doc(db, analyticDocPath), currentData, { merge: true });
  } catch (err) {
    console.error("[Diagnostics] Erro incrementando analíticas no Firestore:", err);
  }
}

// Global Core Message Processing Pipeline
async function handleWebhookIncomingMessage(
  senderPhone: string, 
  text: string, 
  isButton: boolean,
  isMockOnly: boolean
): Promise<{ reply?: string; alertTriggered: boolean }> {
  
  let alertTriggered = false;
  let replyText = "";
  const timestamp = new Date().toISOString();

  // Falling back to local offline sandbox
  if (isMockOnly || !firebaseActive || !db) {
    let lead = localLeads.find(l => l.phone.replace(/[^0-9]/g, "") === senderPhone.replace(/[^0-9]/g, ""));
    const activeStore = STORES.find(s => s.id === globalFlowConfig.activeStoreId) || STORES[0];

    if (!lead) {
      const randSuffix = Math.random().toString(36).substring(2, 7);
      lead = {
        id: `lead-${Date.now()}-${randSuffix}`,
        name: `Lead (+${senderPhone.slice(-4)})`,
        phone: senderPhone,
        lastMessage: text,
        lastMessageTime: timestamp,
        mode: "AI",
        currentStep: "opt_in",
        unreadCount: 0,
        avatarColor: "bg-indigo-600"
      };
      localLeads.unshift(lead);
      localMessagesDb[lead.id] = [];
      localStats.totalLeads++;
    }

    lead.lastMessage = text;
    lead.lastMessageTime = timestamp;

    const logId = `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    localWebhookLogs.unshift({
      id: logId,
      direction: "INBOUND",
      type: isButton ? "button" : "text",
      payload: JSON.stringify({ phone: senderPhone, message: text }),
      timestamp
    });

    const userMsgId = `m-u-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    localMessagesDb[lead.id].push({
      id: userMsgId,
      role: "user",
      text,
      timestamp,
      isButtonResponse: isButton
    });

    if (lead.currentStep === "opt_in") {
      const isAccept = isButton || globalFlowConfig.optInButtons.some(b => text.toLowerCase().includes(b.toLowerCase()));
      if (isAccept) {
        lead.currentStep = "chatting";
        lead.mode = "AI";
        localStats.aiHandled++;

        replyText = globalFlowConfig.aiGreeting.replace("{store}", activeStore.name);
        const replyMsgId = `m-a-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        localMessagesDb[lead.id].push({
          id: replyMsgId,
          role: "assistant",
          text: replyText,
          timestamp
        });
      } else {
        replyText = `⚠️ Central de Atendimento **${activeStore.name}**:\nPor favor, confirme seu acolhimento seguro clicando em um dos botões do WhatsApp acima!`;
        const replyMsgId = `m-w-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        localMessagesDb[lead.id].push({
          id: replyMsgId,
          role: "assistant",
          text: replyText,
          timestamp
        });
      }
      return { reply: replyText, alertTriggered };
    }

    // Checking intent triggers using custom keywords
    const intent = await classifyLeadIntent(text, globalFlowConfig.escalationKeywords);
    if (intent === "venda_humana" && lead.mode === "AI") {
      lead.mode = "HUMAN";
      lead.currentStep = "human_escalated";
      localStats.humanHandled++;
      alertTriggered = true;

      const alertMsg = `🤖 [Transição Automática] Gatilho de compras acionado ("${text}"). Atendimento suspenso. Aguardando vendedor faturar no balcão!`;
      const sysMsgId = `m-sys-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      localMessagesDb[lead.id].push({
        id: sysMsgId,
        role: "system_alert",
        text: alertMsg,
        timestamp
      });
      return { reply: undefined, alertTriggered };
    }

    if (lead.mode === "AI") {
      localStats.conversationsSaved++;
      localStats.savedTokens += 150;
      localStats.responseTimeSavedSec += 120;

      const history = buildSmartContext(localMessagesDb[lead.id]);
      replyText = await generateAIResponse(text, history, globalFlowConfig, activeStore);
      
      const aiMsgId = `m-ai-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      localMessagesDb[lead.id].push({
        id: aiMsgId,
        role: "assistant",
        text: replyText,
        timestamp
      });
    }

    return { reply: replyText, alertTriggered };
  }

  // Connected Production Workloads (Direct Firestore mapping)
  const leadDocPath = `leads/${senderPhone}`;
  const messagesCollectionPath = `leads/${senderPhone}/messages`;
  
  try {
    const leadSnap = await getDoc(doc(db, leadDocPath));
    let leadData: any = null;
    let flowConfigData = globalFlowConfig;

    try {
      const flowSnap = await getDoc(doc(db, "flows/config"));
      if (flowSnap.exists()) {
        flowConfigData = flowSnap.data() as FlowConfig;
      }
    } catch (e) {}

    const activeStore = STORES.find(s => s.id === flowConfigData.activeStoreId) || STORES[0];

    if (!leadSnap.exists()) {
      leadData = {
        id: senderPhone,
        name: `Cliente (+${senderPhone.slice(-4)})`,
        phone: senderPhone,
        lastMessage: text,
        lastMessageTime: timestamp,
        mode: "AI",
        currentStep: "opt_in",
        unreadCount: 0,
        avatarColor: "bg-indigo-600"
      };
      await setDoc(doc(db, leadDocPath), leadData);
      await incrementDashboardAnalytics("leads");
    } else {
      leadData = leadSnap.data();
    }

    const userMsgId = `msg-rec-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    await setDoc(doc(db, `${messagesCollectionPath}/${userMsgId}`), {
      id: userMsgId,
      leadId: senderPhone,
      role: "user",
      text,
      timestamp,
      isButtonResponse: isButton
    });

    const logId = `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    await setDoc(doc(db, `webhook_logs/${logId}`), {
      id: logId,
      direction: "INBOUND",
      type: isButton ? "button" : "text",
      payload: JSON.stringify({ phone: senderPhone, text, messageDetails: "Inbound Meta API call" }),
      timestamp
    });

    leadData.lastMessage = text;
    leadData.lastMessageTime = timestamp;

    if (leadData.currentStep === "opt_in") {
      const isAccept = isButton || flowConfigData.optInButtons.some(b => text.toLowerCase().includes(b.toLowerCase()));
      if (isAccept) {
        leadData.currentStep = "chatting";
        leadData.mode = "AI";
        await incrementDashboardAnalytics("ai");

        replyText = flowConfigData.aiGreeting.replace("{store}", activeStore.name);
        await sendWhatsAppMessage(senderPhone, replyText);

        const replyId = `msg-rep-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        await setDoc(doc(db, `${messagesCollectionPath}/${replyId}`), {
          id: replyId,
          leadId: senderPhone,
          role: "assistant",
          text: replyText,
          timestamp
        });
      } else {
        replyText = `⚠️ Central **${activeStore.name}**:\nPor favor, confirme tocando em um dos botões interativos acima para darmos andamento à sua cotação!`;
        await sendWhatsAppMessage(senderPhone, replyText, flowConfigData.optInButtons);

        const replyId = `msg-rep-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        await setDoc(doc(db, `${messagesCollectionPath}/${replyId}`), {
          id: replyId,
          leadId: senderPhone,
          role: "assistant",
          text: replyText,
          timestamp
        });
      }

      await updateDoc(doc(db, leadDocPath), leadData);
      return { reply: replyText, alertTriggered };
    }

    const intent = await classifyLeadIntent(text, flowConfigData.escalationKeywords);
    if (intent === "venda_humana" && leadData.mode === "AI") {
      leadData.mode = "HUMAN";
      leadData.currentStep = "human_escalated";
      alertTriggered = true;

      await incrementDashboardAnalytics("human");

      const alertMsg = `🤖 [Transição Automática] Gatilho de compras acionado ("${text}"). Atendimento transferido com sucesso para vendedores humanos!`;
      await sendWhatsAppMessage(senderPhone, `Entendi, amigo! Vou te passar agora mesmo para um de nossos consultores de vendas do balcão para concluir sua compra e formas de pagamento. Segura as pontas!`);

      const alertId = `msg-alert-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      await setDoc(doc(db, `${messagesCollectionPath}/${alertId}`), {
        id: alertId,
        leadId: senderPhone,
        role: "system_alert",
        text: alertMsg,
        timestamp
      });

      await updateDoc(doc(db, leadDocPath), leadData);
      return { reply: undefined, alertTriggered };
    }

    if (leadData.mode === "AI") {
      await incrementDashboardAnalytics("saved");

      let historyText = "";
      try {
        const histSnap = await getDocs(query(collection(db, messagesCollectionPath), orderBy("timestamp", "desc"), limit(6)));
        const messagesToContext: any[] = [];
        histSnap.forEach(d => messagesToContext.push(d.data()));
        messagesToContext.reverse();
        historyText = buildSmartContext(messagesToContext);
      } catch (e) {}

      replyText = await generateAIResponse(text, historyText, flowConfigData, activeStore);
      await sendWhatsAppMessage(senderPhone, replyText);

      const replyId = `msg-rep-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      await setDoc(doc(db, `${messagesCollectionPath}/${replyId}`), {
        id: replyId,
        leadId: senderPhone,
        role: "assistant",
        text: replyText,
        timestamp
      });
    } else {
      leadData.unreadCount = (leadData.unreadCount || 0) + 1;
    }

    await updateDoc(doc(db, leadDocPath), leadData);
  } catch (err) {
    console.error("[Engine] Erro no processamento de mensagens Firestore:", err);
  }

  return { reply: replyText, alertTriggered };
}

// --- Express API Router ---

app.get("/api/stores", (req: Request, res: Response) => {
  res.json(STORES);
});

app.get("/api/flow-config", async (req: Request, res: Response) => {
  if (firebaseActive && db) {
    try {
      const snap = await getDoc(doc(db, "flows/config"));
      if (snap.exists()) {
        res.json(snap.data());
        return;
      }
    } catch (e) {}
  }
  res.json(globalFlowConfig);
});

app.post("/api/flow-config", async (req: Request, res: Response) => {
  const newConfig = { ...globalFlowConfig, ...req.body };
  if (firebaseActive && db) {
    try {
      await setDoc(doc(db, "flows/config"), newConfig, { merge: true });
    } catch (e) {}
  } else {
    globalFlowConfig = newConfig;
  }
  res.json({ success: true, flowConfig: newConfig });
});

app.get("/api/stats", (req: Request, res: Response) => {
  res.json({
    ...localStats,
    apiConnected: !!process.env.OPENAI_API_KEY || !!process.env.GEMINI_API_KEY
  });
});

app.get("/api/leads", (req: Request, res: Response) => {
  res.json(localLeads);
});

app.get("/api/leads/:id/messages", (req: Request, res: Response) => {
  const messages = localMessagesDb[req.params.id] || [];
  res.json(messages);
});

app.post("/api/leads/:id/toggle-mode", (req: Request, res: Response) => {
  const { id } = req.params;
  const lead = localLeads.find(l => l.id === id);
  if (!lead) {
     res.status(404).json({ error: "Lead não encontrado" });
     return;
  }
  
  lead.mode = lead.mode === "AI" ? "HUMAN" : "AI";
  if (lead.mode === "HUMAN") {
    lead.currentStep = "human_escalated";
    localStats.aiHandled = Math.max(0, localStats.aiHandled - 1);
    localStats.humanHandled++;
  } else {
    lead.currentStep = "chatting";
    localStats.humanHandled = Math.max(0, localStats.humanHandled - 1);
    localStats.aiHandled++;
  }

  const notifierMsg = `⚙️ [Modo Alterado Manualmente] Atendimento modificado para **${lead.mode === "AI" ? "IA AUTOMAÇÃO" : "HUMAN ESCALAÇÃO"}** no painel comercial.`;
  if (!localMessagesDb[id]) localMessagesDb[id] = [];
  localMessagesDb[id].push({
    id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}-manual-toggle`,
    role: "system_alert",
    text: notifierMsg,
    timestamp: new Date().toISOString()
  });

  res.json({ success: true, lead });
});

app.post("/api/leads/:id/messages", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { text } = req.body;
  const timestamp = new Date().toISOString();

  if (firebaseActive && db) {
    try {
      const leadSnap = await getDoc(doc(db, `leads/${id}`));
      if (leadSnap.exists()) {
        const leadData = leadSnap.data();
        await sendWhatsAppMessage(leadData.phone, text);

        const messageId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}-h`;
        await setDoc(doc(db, `leads/${id}/messages/${messageId}`), {
          id: messageId,
          leadId: id,
          role: "agent_human",
          text,
          timestamp
        });

        await updateDoc(doc(db, `leads/${id}`), {
          lastMessage: text,
          lastMessageTime: timestamp,
          unreadCount: 0
        });

        const logId = `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        await setDoc(doc(db, `webhook_logs/${logId}`), {
          id: logId,
          direction: "OUTBOUND",
          type: "text",
          payload: JSON.stringify({ recipient: leadData.phone, origin: "MANUAL_OPERATOR", text }),
          timestamp
        });
      }
    } catch(err) {
      console.error("[Rest Router] Erro enviando mensagem via Firestore:", err);
    }
  }

  const lead = localLeads.find(l => l.id === id);
  if (lead) {
    if (!localMessagesDb[id]) {
      localMessagesDb[id] = [];
    }

    const newMsg: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}-h`,
      role: "agent_human",
      text,
      timestamp
    };

    localMessagesDb[id].push(newMsg);
    lead.lastMessage = text;
    lead.lastMessageTime = timestamp;
    lead.unreadCount = 0;

    localWebhookLogs.unshift({
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}-h-manual`,
      direction: "OUTBOUND",
      type: "text",
      payload: JSON.stringify({ recipient: lead.phone, origin: "MANUAL_OPERATOR", text }),
      timestamp
    });
  }

  res.json({ success: true });
});

app.get("/api/webhook", async (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  let systemToken = "opt_in_prevent_ban";
  if (firebaseActive && db) {
    try {
      const snap = await getDoc(doc(db, "settings", "whatsapp"));
      if (snap.exists() && snap.data().verifyToken) {
        systemToken = snap.data().verifyToken;
      }
    } catch(e){}
  }

  systemToken = process.env.META_VERIFY_TOKEN || systemToken;

  if (mode === "subscribe" && token === systemToken) {
    console.log("[Meta webhook verified successfully]");
    res.status(200).send(challenge);
  } else {
    res.status(403).send("VERIFY_TOKEN_MISMATCH");
  }
});

app.post("/api/webhook", async (req: Request, res: Response) => {
  const body = req.body;
  if (body.object === "whatsapp_business_account") {
    try {
      const entry = body.entry?.[0];
      const change = entry?.changes?.[0];
      const value = change?.value;
      const message = value?.messages?.[0];

      if (message) {
        const senderPhone = message.from;
        const text = message.text?.body || message.button?.text || "Olá!";
        const isButton = !!message.button;
        const messageId = message.id || `msg-meta-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

        // Process message in background using individual user queue to prevent blocking & duplicated triggers
        enqueueIncomingMessage({
          senderPhone,
          text,
          isButton,
          isMockOnly: false,
          messageId
        });
      }
    } catch (e) {
      console.error("[Meta webhook hook fail]:", e);
    }
    // Respond to Meta immediately with a 200 OK (under 10ms) so WhatsApp doesn't send duplicate retry requests
    res.status(200).send("EVENT_RECEIVED");
  } else {
    res.status(404).send();
  }
});

app.post("/api/simulate-webhook", async (req: Request, res: Response) => {
  const { senderPhone, text, isButton, isMockMode } = req.body;
  if (!senderPhone || !text) {
     res.status(400).json({ error: "Parâmetros em falta" });
     return;
  }

  const mockVal = isMockMode !== undefined ? isMockMode : true;
  const result = await handleWebhookIncomingMessage(senderPhone, text, !!isButton, mockVal);
  
  let updatedLead: any = null;
  if (mockVal) {
    updatedLead = localLeads.find(l => l.phone.includes(senderPhone));
  } else if (firebaseActive && db) {
    try {
      const gSnap = await getDoc(doc(db, `leads/${senderPhone}`));
      if (gSnap.exists()) updatedLead = gSnap.data();
    } catch(e){}
  }

  res.json({ 
    success: true, 
    lead: updatedLead, 
    reply: result.reply, 
    alertTriggered: result.alertTriggered 
  });
});

app.post("/api/simulate-new-lead", async (req: Request, res: Response) => {
  const { name, phone, car, year, parts, isMockMode } = req.body;
  if (!phone) {
    res.status(400).json({ error: "Número obrigatório" });
    return;
  }

  const mockVal = isMockMode !== undefined ? isMockMode : true;
  const timestamp = new Date().toISOString();

  let newLead: Lead;

  if (mockVal) {
    const randomColors = ["bg-emerald-500", "bg-sky-500", "bg-indigo-500", "bg-purple-500", "bg-amber-500", "bg-rose-500"];
    const newId = `lead-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    newLead = {
      id: newId,
      name: name || `Simulado (${phone.slice(-4)})`,
      phone,
      lastMessage: "Aguardando Opt-in seguro",
      lastMessageTime: timestamp,
      mode: "AI",
      currentStep: "opt_in",
      unreadCount: 0,
      avatarColor: randomColors[Math.floor(Math.random() * randomColors.length)]
    };

    localLeads.unshift(newLead);
    localMessagesDb[newId] = [
      {
        id: `m-init-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        role: "assistant",
        text: globalFlowConfig.optInText,
        timestamp,
        buttons: globalFlowConfig.optInButtons
      }
    ];
    localStats.totalLeads = localLeads.length;

    localWebhookLogs.unshift({
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      direction: "INBOUND",
      type: "template",
      payload: JSON.stringify({ action: "NEW_TRAFFIC_CONV", name, phone, car }),
      timestamp
    });
  } else {
    const leadDocPath = `leads/${phone}`;
    const messagesCollectionPath = `leads/${phone}/messages`;

    newLead = {
      id: phone,
      name: name || `Cliente (${phone.slice(-4)})`,
      phone,
      lastMessage: "Aguardando Opt-in seguro",
      lastMessageTime: timestamp,
      mode: "AI",
      currentStep: "opt_in",
      unreadCount: 0,
      avatarColor: "bg-indigo-500"
    };

    await setDoc(doc(db, leadDocPath), newLead);
    
    // Save opt-in message
    const msgId = `msg-init-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    await setDoc(doc(db, `${messagesCollectionPath}/${msgId}`), {
      id: msgId,
      leadId: phone,
      role: "assistant",
      text: globalFlowConfig.optInText,
      timestamp,
      buttons: globalFlowConfig.optInButtons
    });

    // Save initial audit webhook log
    const logId = `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    await setDoc(doc(db, `webhook_logs/${logId}`), {
      id: logId,
      direction: "INBOUND",
      type: "template",
      payload: JSON.stringify({ action: "NEW_TRAFFIC_CONV", name, phone }),
      timestamp
    });

    await incrementDashboardAnalytics("leads");
  }

  res.json({ success: true, lead: newLead });
});

app.get("/api/webhook-logs", (req: Request, res: Response) => {
  res.json(localWebhookLogs);
});

app.post("/api/webhook-logs/clear", (req: Request, res: Response) => {
  localWebhookLogs = [];
  res.json({ success: true });
});

// Start Server Wrapper
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    try {
      const viteModule = await import("vite");
      const createViteServer = viteModule.createServer;
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa"
      });
      app.use(vite.middlewares);
    } catch (e) {
      console.log("[Backend Mode] Running API routes only.");
    }
  } else {
    // Statics
    const distPath = fs.existsSync(path.join(process.cwd(), "dist"))
      ? path.join(process.cwd(), "dist")
      : path.join(process.cwd(), "..", "frontend", "dist");

    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get("*", (req: Request, res: Response) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    } else {
      console.log(`[Backup Node Server] Atenção: ${distPath} não localizado.`);
    }
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Central Autocar API Engine] Online on http://localhost:${PORT}`);
  });
}

startServer();
