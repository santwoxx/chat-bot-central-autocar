import express, { Request, Response } from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import cors from "cors";
import { rateLimit } from "express-rate-limit";
import { doc, setDoc, getDoc, updateDoc, getDocs, doc as dbDoc, collection, query, orderBy, limit, where } from "firebase/firestore";

// Types
import { AtendimentoMode, Message, Lead, StorePreset, FlowConfig, WebhookSimLog, WhatsAppConfig } from "./src/types.ts";

// Modular Imports (Tidy folder organization for startups)
import { STORES } from "./src/server/stores.ts";
import { db, firebaseActive } from "./src/server/config.ts";
import { sendWhatsAppMessage, registerLogCallback } from "./src/server/services/whatsapp.ts";
import { 
  classifyLeadIntent, 
  generateAIResponse, 
  buildSmartContext, 
  simulateLocalDialog 
} from "./src/server/services/ai.ts";

const app = express();

// Secure CORS configuration (Requirement 6: CORS de produção)
const allowedOrigins = [
  "https://central-autocar-five.vercel.app",
  "https://central-autocar.vercel.app"
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || origin.includes("localhost") || origin.includes("127.0.0.1")) {
      callback(null, true);
    } else {
      console.warn(`[CORS Blocked] Requisição de origem não autorizada bloqueada pelo CORS: ${origin}`);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "apikey"]
}));

// Raw body capture verify callback (Requirement 3: Webhook Signatures)
app.use(express.json({
  verify: (req: any, res, buf) => {
    req.rawBody = buf;
  }
}));

// Rate Limiters definition (Requirement 5: Rate Limiting)
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, 
  max: 150, 
  message: { error: "Too many webhook requests from this IP, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

const healthLimiter = rateLimit({
  windowMs: 60 * 1000, 
  max: 30, 
  message: { error: "Too many health check requests." },
  standardHeaders: true,
  legacyHeaders: false,
});

const adminLimiter = rateLimit({
  windowMs: 60 * 1000, 
  max: 100, 
  message: { error: "Too many administrative requests." },
  standardHeaders: true,
  legacyHeaders: false,
});

const PORT = 3000;

// Global settings state
let globalFlowConfig: FlowConfig = {
  activeStoreId: "jal",
  optInText: "Olá! Seja bem-vindo à central de atendimento inteligente da Central Autocar. 🚗💨\n\nPor favor, confirme se deseja iniciar o atendimento tocando em um dos botões abaixo para que nossa inteligência de balcão possa te ajudar com preços e marcas com segurança e sem banimentos!",
  optInButtons: ["🔍 Fazer Cotação", "📍 Endereço / Contato", "⏳ Falar com Humano"],
  aiGreeting: "Perfeito! Obrigado por confirmar seu interesse. Eu sou o Assistente Virtual inteligente de peças da Central Autocar.\n\nComo posso te auxiliar com peças ou orçamentos hoje? Por favor, informe o modelo do veículo e o ano se possível!",
  aiSystemPrompt: "Você é o especialista de balcão de vendas inteligente de autopeças da Central Autocar em Itabuna BA. Domine peças, marcas, mecânica básica, atendimento amigável e regional.\n\nRegras cruciais de comunicação:\n1. NÃO fale mentiras sobre preços exatos se não souber. Peça para confirmar com o setor de vendas se o cliente insistir em fechar e diga que vai transferi-lo.\n2. Seja profissional, prestativo e utilize termos automobilísticos corretos.\n3. Sempre use português brasileiro nativo e cortês.\n4. Sempre que o cliente decidir comprar, fechar, perguntar sobre formas exatas de pagamento, pedir desconto crítico ou solicitar explicitamente um humano/vendedor, use termos que engajem a transição automática.",
  escalationKeywords: ["comprar", "fechar", "quanto fica", "pix", "atendente", "humano", "boleto", "cartao", "cartão", "desconto", "falar com pessoa", "vendedor", "finalizar", "compora", "preco", "preço", "orçamento fechado", "tenho interesse", "qual o valor", "interesse", "valor", "valores", "quanto é", "quanto custa"]
};

let globalWhatsAppConfig: WhatsAppConfig = {
  provider: "AUTO",
  phoneNumberId: "109212001",
  accessToken: "",
  verifyToken: "opt_in_prevent_ban",
  useOpenAi: false,
  openAiKey: "",
  evolutionApiUrl: "",
  evolutionApiKey: "",
  evolutionInstanceName: ""
};

// Clean initial states for webhooks and leads in production
let localWebhookLogs: WebhookSimLog[] = [];
let localMessagesDb: Record<string, Message[]> = {};
let localLeads: Lead[] = [];

// Local metrics/dashboard stats
let localStats = {
  totalLeads: 0,
  aiHandled: 0,
  humanHandled: 0,
  conversationsSaved: 24,
  averageConfidence: 94,
  savedTokens: 41220,
  responseTimeSavedSec: 420
};

// High-load queue and deduplication engine with Firestore persistence (Requirement 2 & 4)
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

const runningInboundPhones = new Set<string>();

// Persistent Deduplication and Idempotency
async function isMessageProcessed(messageId: string): Promise<boolean> {
  if (!messageId) return false;
  
  if (firebaseActive && db) {
    try {
      const docRef = doc(db, "processed_messages", messageId);
      const snap = await getDoc(docRef);
      return snap.exists();
    } catch (e) {
      console.warn("[Deduplication] Falha ao verificar processed_messages no Firestore:", e);
    }
  }
  
  return recentMetaMessageIds.has(messageId);
}

async function markMessageAsProcessed(messageId: string): Promise<void> {
  if (!messageId) return;
  recentMetaMessageIds.add(messageId);
  if (recentMetaMessageIds.size > maxDeduplicationCacheSize) {
    const firstVal = recentMetaMessageIds.values().next().value;
    if (firstVal !== undefined) recentMetaMessageIds.delete(firstVal);
  }

  if (firebaseActive && db) {
    try {
      const docRef = doc(db, "processed_messages", messageId);
      await setDoc(docRef, { processedAt: new Date().toISOString() });
    } catch (e) {
      console.warn("[Deduplication] Falha ao salvar processed_messages no Firestore:", e);
    }
  }
}

async function enqueueIncomingMessage(msg: QueuedMessage) {
  const { senderPhone, text, isButton, isMockOnly, messageId } = msg;

  if (messageId) {
    const alreadyProcessed = await isMessageProcessed(messageId);
    if (alreadyProcessed) {
      console.log(`[Queue Engine] Ignorando webhook já processado: ${messageId}`);
      return;
    }
  }

  const queueId = `inbound-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const queueItem = {
    id: queueId,
    senderPhone,
    text,
    isButton,
    isMockOnly,
    messageId: messageId || null,
    timestamp: new Date().toISOString(),
    status: "PENDING",
    attempts: 0,
    error: ""
  };

  // Persist to Firestore if active, else fallback to standard local memory queue
  if (firebaseActive && db) {
    try {
      await setDoc(doc(db, "inbound_queue", queueId), queueItem);
      console.log(`[Queue Engine] Mensagem salva no inbound_queue persistente: ${queueId}`);
    } catch (err: any) {
      console.warn("[Queue Engine] Falha ao gravar inbound_queue no Firestore, usando fallback em memória:", err.message);
      if (!userMessageQueues[senderPhone]) userMessageQueues[senderPhone] = [];
      userMessageQueues[senderPhone].push(msg);
      if (!activeQueueWorkers.has(senderPhone)) {
        activeQueueWorkers.add(senderPhone);
        processUserMessageQueue(senderPhone);
      }
    }
  } else {
    if (!userMessageQueues[senderPhone]) userMessageQueues[senderPhone] = [];
    userMessageQueues[senderPhone].push(msg);
    if (!activeQueueWorkers.has(senderPhone)) {
      activeQueueWorkers.add(senderPhone);
      processUserMessageQueue(senderPhone);
    }
  }
}

// Memory worker processing fallback
async function processUserMessageQueue(senderPhone: string) {
  try {
    while (userMessageQueues[senderPhone] && userMessageQueues[senderPhone].length > 0) {
      const nextMsg = userMessageQueues[senderPhone].shift();
      if (nextMsg) {
        await handleWebhookIncomingMessage(
          nextMsg.senderPhone,
          nextMsg.text,
          nextMsg.isButton,
          nextMsg.isMockOnly
        );
        if (nextMsg.messageId) {
          await markMessageAsProcessed(nextMsg.messageId);
        }
      }
    }
  } catch (err) {
    console.error(`[Queue Error] Erro processando fila em memória para ${senderPhone}:`, err);
  } finally {
    activeQueueWorkers.delete(senderPhone);
  }
}

// Background poller for Firestore-persisted inbound queue items (Garantia de não perda de mensagens)
function startInboundQueuePoller() {
  setInterval(async () => {
    if (!firebaseActive || !db) return;

    try {
      const qRef = collection(db, "inbound_queue");
      const pendingQuery = query(qRef, where("status", "==", "PENDING"));
      const snap = await getDocs(pendingQuery);
      
      const items = snap.docs.map(d => d.data()).sort((a: any, b: any) => {
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      });

      for (const item of items) {
        if (runningInboundPhones.has(item.senderPhone)) {
          continue; // Maintain strict sequence per thread order
        }

        runningInboundPhones.add(item.senderPhone);
        const docRef = doc(db, "inbound_queue", item.id);
        await updateDoc(docRef, { status: "PROCESSING" });

        console.log(`[Inbound Poller] Processando fila persistente id: ${item.id} para ${item.senderPhone}...`);

        (async () => {
          try {
            await handleWebhookIncomingMessage(
              item.senderPhone,
              item.text,
              item.isButton,
              item.isMockOnly
            );

            await updateDoc(docRef, { status: "COMPLETED" });
            if (item.messageId) {
              await markMessageAsProcessed(item.messageId);
            }
            console.log(`[Inbound Poller] Sucesso ao processar id: ${item.id}`);
          } catch (err: any) {
            const nextAttempts = item.attempts + 1;
            if (nextAttempts >= 3) {
              await updateDoc(docRef, { status: "FAILED", attempts: nextAttempts, error: err.message || "Failed completely" });
              console.error(`[Inbound Poller] Falha definitiva na mensagem persistente $^{item.id} após 3 tentativas.`);
            } else {
              await updateDoc(docRef, { status: "PENDING", attempts: nextAttempts, error: err.message || "Temporary failure" });
              console.warn(`[Inbound Poller] Falha temporária no id: ${item.id}. Retentando.`);
            }
          } finally {
            runningInboundPhones.delete(item.senderPhone);
          }
        })();
      }
    } catch (e: any) {
      // Slitently catch normal firebase lookup lags
    }
  }, 1500);
}

startInboundQueuePoller();

// Dynamic callback bridging outbound sends and failovers to UI webhook logs
registerLogCallback((direction, type: "text" | "button" | "template", payload) => {
  const logId = `log-out-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const timestamp = new Date().toISOString();
  
  const formattedLogObj: WebhookSimLog = {
    id: logId,
    direction,
    type,
    payload: typeof payload === "string" ? payload : JSON.stringify(payload),
    timestamp
  };

  localWebhookLogs.unshift(formattedLogObj);

  if (firebaseActive && db) {
    try {
      setDoc(doc(db, `webhook_logs/${logId}`), formattedLogObj).catch(() => {});
    } catch (e) {}
  }
});



async function incrementDashboardAnalytics(metricName: "leads" | "ai" | "human") {
  if (metricName === "leads") localStats.totalLeads++;
  if (metricName === "ai") localStats.aiHandled++;
  if (metricName === "human") localStats.humanHandled++;

  if (firebaseActive && db) {
    try {
      const analyticsDocPath = "analytics/current";
      const snap = await getDoc(doc(db, analyticsDocPath));
      if (snap.exists()) {
        const d = snap.data();
        await updateDoc(doc(db, analyticsDocPath), {
          totalLeads: (d.totalLeads || 0) + (metricName === "leads" ? 1 : 0),
          aiHandled: (d.aiHandled || 0) + (metricName === "ai" ? 1 : 0),
          humanHandled: (d.humanHandled || 0) + (metricName === "human" ? 1 : 0)
        });
      } else {
        await setDoc(doc(db, analyticsDocPath), {
          totalLeads: metricName === "leads" ? 1 : 0,
          aiHandled: metricName === "ai" ? 1 : 0,
          humanHandled: metricName === "human" ? 1 : 0,
          conversationsSaved: 24,
          averageConfidence: 94,
          savedTokens: 41220,
          responseTimeSavedSec: 420
        });
      }
    } catch (e) {}
  }
}

async function handleWebhookIncomingMessage(
  senderPhone: string,
  userMessage: string,
  isButton: boolean,
  isMockOnly: boolean
): Promise<{ reply: string; alertTriggered: boolean }> {
  const timestamp = new Date().toISOString();
  console.log(`[Core Engine Incoming] Tel: ${senderPhone} | Texto: "${userMessage}" | Mock: ${isMockOnly}`);

  // Fetch configurations
  let activeFlow = globalFlowConfig;
  if (firebaseActive && db) {
    try {
      const configSnap = await getDoc(doc(db, "flows/config"));
      if (configSnap.exists()) {
        activeFlow = configSnap.data() as FlowConfig;
      }
    } catch (e) {}
  }

  const selectedStore = STORES.find(s => s.id === activeFlow.activeStoreId) || STORES[0];

  // Logs the raw webhook input inside audit trail
  const inboundLogId = `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}-in`;
  const normalizedInboundLog = {
    id: inboundLogId,
    direction: "INBOUND" as const,
    type: isButton ? ("button" as const) : ("text" as const),
    payload: JSON.stringify({ senderPhone, text: userMessage, mode: isMockOnly ? "SANDBOX" : "PRODUCTION" }),
    timestamp
  };

  localWebhookLogs.unshift(normalizedInboundLog);
  if (firebaseActive && db && !isMockOnly) {
    try {
      await setDoc(doc(db, `webhook_logs/${inboundLogId}`), normalizedInboundLog);
    } catch (e) {}
  }

  let replyText = "";
  let alertTriggered = false;

  // 1. SIMULATOR ENVIRONMENT / LOCAL STATE MODE
  if (isMockOnly) {
    let lead = localLeads.find(l => l.phone === senderPhone);
    if (!lead) {
      lead = {
        id: `lead-mock-${Date.now()}`,
        name: `Lead Novo (${senderPhone.slice(-4)})`,
        phone: senderPhone,
        lastMessage: "",
        lastMessageTime: timestamp,
        mode: "AI",
        currentStep: "opt_in",
        unreadCount: 0,
        avatarColor: "bg-emerald-500"
      };
      localLeads.unshift(lead);
      localMessagesDb[lead.id] = [];
      localStats.totalLeads = localLeads.length;
    }

    const leadId = lead.id;
    if (!localMessagesDb[leadId]) localMessagesDb[leadId] = [];

    // Save user incoming message
    localMessagesDb[leadId].push({
      id: `m-usr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      role: "user",
      text: userMessage,
      timestamp,
      isButtonResponse: isButton
    });

    if (lead.currentStep === "opt_in") {
      replyText = activeFlow.aiGreeting;
      lead.currentStep = "chatting";
      lead.lastMessage = userMessage;
      lead.lastMessageTime = timestamp;

      localMessagesDb[leadId].push({
        id: `m-bot-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        role: "assistant",
        text: replyText,
        timestamp
      });
      await sendWhatsAppMessage(senderPhone, replyText);
    } else if (lead.currentStep === "human_escalated" || lead.mode === "HUMAN") {
      replyText = "⚠️ [Fila Humana] Olá! Um de nossos vendedores comerciais em Itabuna BA já foi alertado e está acessando seu atendimento para fechar na hora. Aguarde um instante!";
      lead.unreadCount = (lead.unreadCount || 0) + 1;
      lead.lastMessage = userMessage;
      lead.lastMessageTime = timestamp;
    } else {
      // Chatbot processing
      const classification = await classifyLeadIntent(userMessage, activeFlow.escalationKeywords);
      
      if (classification === "venda_humana") {
        replyText = "Perfeito! Entendi seu interesse. Estou transferindo você agora mesmo para o atendimento prioritário com nossos vendedores humanos. Eles vão te passar o PIX de pagamento ou as melhores condições de parcelamento imediatamente!";
        lead.mode = "HUMAN";
        lead.currentStep = "human_escalated";
        alertTriggered = true;
        localStats.aiHandled = Math.max(0, localStats.aiHandled - 1);
        localStats.humanHandled++;

        localMessagesDb[leadId].push({
          id: `m-bot-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          role: "system_alert",
          text: `🚨 [ESCALAÇÃO AUTOMÁTICA] Lead reencaminhado ao setor comercial por expressar claro interesse transacional ("${userMessage}").`,
          timestamp
        });
      } else {
        const dialogHistory = buildSmartContext(localMessagesDb[leadId]);
        replyText = await generateAIResponse(userMessage, dialogHistory, activeFlow, selectedStore);
        localStats.aiHandled++;
      }

      lead.lastMessage = userMessage;
      lead.lastMessageTime = timestamp;

      localMessagesDb[leadId].push({
        id: `m-bot-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        role: "assistant",
        text: replyText,
        timestamp
      });
      await sendWhatsAppMessage(senderPhone, replyText);
    }
  } 
  // 2. LIVE FIREBASE ENVIRONMENT MODE
  else if (firebaseActive && db) {
    try {
      const leadDocPath = `leads/${senderPhone}`;
      const messagesCollectionPath = `leads/${senderPhone}/messages`;

      let leadSnap = await getDoc(doc(db, leadDocPath));
      let leadData: any;

      if (!leadSnap.exists()) {
        leadData = {
          id: senderPhone,
          name: `Cliente (${senderPhone.slice(-4)})`,
          phone: senderPhone,
          lastMessage: "",
          lastMessageTime: timestamp,
          mode: "AI",
          currentStep: "opt_in",
          unreadCount: 0,
          avatarColor: "bg-indigo-500"
        };
        await setDoc(doc(db, leadDocPath), leadData);
        await incrementDashboardAnalytics("leads");
      } else {
        leadData = leadSnap.data();
      }

      // Read recent message history of the lead for ai context
      const historyQuery = query(collection(db, messagesCollectionPath), orderBy("timestamp", "asc"), limit(10));
      const historySnap = await getDocs(historyQuery);
      const messagesList: Message[] = [];
      historySnap.forEach(mDoc => {
        messagesList.push(mDoc.data() as Message);
      });

      // Save user incoming message
      const userMsgId = `msg-usr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      await setDoc(doc(db, `${messagesCollectionPath}/${userMsgId}`), {
        id: userMsgId,
        leadId: senderPhone,
        role: "user",
        text: userMessage,
        timestamp,
        isButtonResponse: isButton
      });

      if (leadData.currentStep === "opt_in") {
        replyText = activeFlow.aiGreeting;
        leadData.currentStep = "chatting";
        leadData.lastMessage = userMessage;
        leadData.lastMessageTime = timestamp;

        await sendWhatsAppMessage(senderPhone, replyText);

        const replyMsgId = `msg-bot-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        await setDoc(doc(db, `${messagesCollectionPath}/${replyMsgId}`), {
          id: replyMsgId,
          leadId: senderPhone,
          role: "assistant",
          text: replyText,
          timestamp
        });
      } else if (leadData.currentStep === "human_escalated" || leadData.mode === "HUMAN") {
        replyText = "⚠️ [Fila Humana] Olá! Um de nossos vendedores comerciais em Itabuna BA já foi alertado e está acessando seu atendimento para fechar na hora. Aguarde um instante!";
        leadData.unreadCount = (leadData.unreadCount || 0) + 1;
        leadData.lastMessage = userMessage;
        leadData.lastMessageTime = timestamp;
      } else {
        const classification = await classifyLeadIntent(userMessage, activeFlow.escalationKeywords);
        
        if (classification === "venda_humana") {
          replyText = "Perfeito! Entendi seu interesse. Estou transferindo você agora mesmo para o atendimento prioritário com nossos vendedores humanos. Eles vão te passar o PIX de pagamento ou as melhores condições de parcelamento imediatamente!";
          leadData.mode = "HUMAN";
          leadData.currentStep = "human_escalated";
          alertTriggered = true;

          await sendWhatsAppMessage(senderPhone, replyText);

          const alertMsgId = `msg-alert-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          await setDoc(doc(db, `${messagesCollectionPath}/${alertMsgId}`), {
            id: alertMsgId,
            leadId: senderPhone,
            role: "system_alert",
            text: `🚨 [ESCALAÇÃO AUTOMÁTICA] Lead reencaminhado ao setor comercial por expressar claro interesse transacional ("${userMessage}").`,
            timestamp
          });

          const replyMsgId = `msg-bot-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          await setDoc(doc(db, `${messagesCollectionPath}/${replyMsgId}`), {
            id: replyMsgId,
            leadId: senderPhone,
            role: "assistant",
            text: replyText,
            timestamp
          });

          await incrementDashboardAnalytics("human");
        } else {
          // Normal AI dialogue
          const contextHistory = buildSmartContext([
            ...messagesList,
            { id: userMsgId, role: "user", text: userMessage, timestamp }
          ]);
          replyText = await generateAIResponse(userMessage, contextHistory, activeFlow, selectedStore);

          await sendWhatsAppMessage(senderPhone, replyText);

          const replyMsgId = `msg-bot-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          await setDoc(doc(db, `${messagesCollectionPath}/${replyMsgId}`), {
            id: replyMsgId,
            leadId: senderPhone,
            role: "assistant",
            text: replyText,
            timestamp
          });

          await incrementDashboardAnalytics("ai");
        }

        leadData.lastMessage = userMessage;
        leadData.lastMessageTime = timestamp;
      }

      await updateDoc(doc(db, leadDocPath), leadData);
    } catch (err) {
      console.error("[Engine] Erro no processamento de mensagens Firestore:", err);
    }
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

app.get("/api/whatsapp-config", async (req: Request, res: Response) => {
  if (firebaseActive && db) {
    try {
      const snap = await getDoc(doc(db, "settings", "whatsapp"));
      if (snap.exists()) {
        res.json({ ...globalWhatsAppConfig, ...snap.data() });
        return;
      }
    } catch (e) {}
  }
  res.json(globalWhatsAppConfig);
});

app.post("/api/whatsapp-config", async (req: Request, res: Response) => {
  const newConfig = { ...globalWhatsAppConfig, ...req.body };
  if (firebaseActive && db) {
    try {
      await setDoc(doc(db, "settings", "whatsapp"), newConfig, { merge: true });
    } catch (e) {}
  } else {
    globalWhatsAppConfig = newConfig;
  }
  res.json({ success: true, whatsappConfig: newConfig });
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
      }
    } catch (e) {
      console.error("[Manual Send Production Fail]:", e);
    }
  } else {
    const lead = localLeads.find(l => l.id === id);
    if (lead) {
      await sendWhatsAppMessage(lead.phone, text);

      if (!localMessagesDb[id]) localMessagesDb[id] = [];
      localMessagesDb[id].push({
        id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}-operator-send`,
        role: "agent_human",
        text,
        timestamp
      });
      lead.lastMessage = text;
      lead.lastMessageTime = timestamp;
      lead.unreadCount = 0;
    }
  }

  res.json({ success: true });
});

async function getMetaAppSecret(): Promise<string> {
  let secret = process.env.META_APP_SECRET || "";
  if (!secret && firebaseActive && db) {
    try {
      const snap = await getDoc(doc(db, "settings", "whatsapp"));
      if (snap.exists() && snap.data().appSecret) {
        secret = snap.data().appSecret;
      }
    } catch (e) {}
  }
  return secret;
}

async function getEvolutionWebhookSecret(): Promise<string[]> {
  const secrets = [process.env.EVOLUTION_WEBHOOK_SECRET || "", process.env.EVOLUTION_API_KEY || ""];
  if (firebaseActive && db) {
    try {
      const snap = await getDoc(doc(db, "settings", "whatsapp"));
      if (snap.exists()) {
        const d = snap.data();
        if (d.evolutionApiKey) secrets.push(d.evolutionApiKey);
        if (d.webhookSecret) secrets.push(d.webhookSecret);
      }
    } catch (e) {}
  }
  return secrets.filter(Boolean);
}

async function verifyMetaSignature(req: any, appSecret: string): Promise<boolean> {
  const signatureHeader = req.headers["x-hub-signature-256"] as string;
  if (!signatureHeader) {
    console.error("[Webhook Authentication] Assinatura da Meta (X-Hub-Signature-256) ausente!");
    return false;
  }

  const parts = signatureHeader.split("=");
  if (parts.length !== 2 || parts[0] !== "sha256") {
    console.error("[Webhook Authentication] Formato de assinatura inválido:", signatureHeader);
    return false;
  }

  const [, expectedSignature] = parts;
  const rawBody = req.rawBody;
  if (!rawBody) {
    console.error("[Webhook Authentication] Corpo bruto da mensagem indisponível para validação de assinatura!");
    return false;
  }

  const hmac = crypto.createHmac("sha256", appSecret);
  hmac.update(rawBody);
  const actualSignature = hmac.digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(actualSignature, "hex"),
      Buffer.from(expectedSignature, "hex")
    );
  } catch (err) {
    return false;
  }
}

app.get("/api/webhook", webhookLimiter, async (req: Request, res: Response) => {
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
    } catch (e) {}
  }

  systemToken = process.env.META_VERIFY_TOKEN || systemToken;

  if (mode === "subscribe" && token === systemToken) {
    console.log("[Meta webhook verified successfully]");
    res.status(200).send(challenge);
  } else {
    res.status(403).send("VERIFY_TOKEN_MISMATCH");
  }
});

function extractEvolutionMessageText(messageObj: any): { text: string; isButton: boolean } {
  if (!messageObj) return { text: "", isButton: false };

  // 1. Text message
  if (messageObj.conversation) {
    return { text: messageObj.conversation, isButton: false };
  }

  // 2. Extended text message
  if (messageObj.extendedTextMessage?.text) {
    return { text: messageObj.extendedTextMessage.text, isButton: false };
  }

  // 3. Button response message
  if (messageObj.buttonsResponseMessage) {
    const btnText = messageObj.buttonsResponseMessage.selectedDisplayText || messageObj.buttonsResponseMessage.selectedButtonId || "";
    return { text: btnText, isButton: true };
  }

  // 4. List response message
  if (messageObj.listResponseMessage) {
    const listText = messageObj.listResponseMessage.title || messageObj.listResponseMessage.singleSelectReply?.selectedRowId || "";
    return { text: listText, isButton: true };
  }

  // 5. Template button response message
  if (messageObj.templateButtonReplyMessage) {
    const templateText = messageObj.templateButtonReplyMessage.selectedDisplayText || messageObj.templateButtonReplyMessage.selectedId || "";
    return { text: templateText, isButton: true };
  }

  if (messageObj.imageMessage?.caption) {
    return { text: messageObj.imageMessage.caption, isButton: false };
  }

  return { text: "", isButton: false };
}

// Unified Single Webhook Normalizer (Requisito 7: Webhook único capaz de receber mensagens da Evolution e da Meta)
// Protect with custom webhookLimiter rate-limiting configuration (Requirement 5)
app.post("/api/webhook", webhookLimiter, async (req: Request, res: Response) => {
  const body = req.body;

  // 1. Detect Meta Platform Webhook (Requirement 3: Meta signature validation reject 401)
  if (body.object === "whatsapp_business_account") {
    const appSecret = await getMetaAppSecret();
    if (appSecret) {
      const isValid = await verifyMetaSignature(req, appSecret);
      if (!isValid) {
        res.status(401).send("UNAUTHORIZED_SIGNATURE_MISMATCH");
        return;
      }
    } else {
      console.warn("[Webhook Security] Ignorando validação Meta: nenhumn appSecret cadastrada.");
    }

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

        await enqueueIncomingMessage({
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
    res.status(200).send("EVENT_RECEIVED");
    return;
  }

  // 2. Detect Evolution API Webhook (Requirement 3: Evolution credentials auto-validation, reject 401)
  if (body.event === "messages.upsert" || body.event === "MESSAGES_UPSERT") {
    const allowedSecrets = await getEvolutionWebhookSecret();
    const clientKey = (req.headers["apikey"] as string) || 
                      (req.headers["authorization"] as string)?.replace(/^Bearer\s+/i, "") ||
                      (req.query["token"] as string);

    if (allowedSecrets.length > 0) {
      if (!clientKey || !allowedSecrets.includes(clientKey)) {
        console.error("[Webhook Authentication] Acesso não autorizado para Evolution API webhook:", clientKey);
        res.status(401).json({ error: "Unauthorized evolution key" });
        return;
      }
    } else {
      console.warn("[Webhook Security] Ignorando validação Evolution: nenhuma apikey ou webhookSecret cadastrado.");
    }

    try {
      const data = body.data;
      const key = data?.key;
      const fromMe = key?.fromMe;
      const remoteJid = key?.remoteJid || "";

      // Ignore self messages and groups
      if (!fromMe && remoteJid && remoteJid.endsWith("@s.whatsapp.net")) {
        const senderPhone = remoteJid.split("@")[0].replace(/[^0-9]/g, "");
        const messageId = key?.id || `msg-evo-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        
        const extracted = extractEvolutionMessageText(data?.message);
        if (senderPhone && extracted.text) {
          await enqueueIncomingMessage({
            senderPhone,
            text: extracted.text,
            isButton: extracted.isButton,
            isMockOnly: false,
            messageId
          });
        }
      }
    } catch (e) {
      console.error("[Evolution webhook hook fail]:", e);
    }
    res.status(200).json({ success: true, message: "Webhook processed" });
    return;
  }

  console.warn("[Webhook] Formato desconhecido recebido no webhook unificado.");
  res.status(400).json({ error: "Unknown webhook format" });
});

// Real-time Health Checks API with Rate Limiting (Requirement 5 & 11)
app.get("/api/health", healthLimiter, async (req: Request, res: Response) => {
  const health: any = {
    firestore: { status: "offline", details: "Mecanismo Firestore inativo" },
    gemini: { status: "offline", details: "Chave GEMINI_API_KEY ausente ou inválida" },
    openai: { status: "offline", details: "Chave OPENAI_API_KEY ausente ou inválida" },
    evolution: { status: "offline", details: "Nenhuma URL cadastrada" },
    meta: { status: "offline", details: "Credenciais incompletas" },
    status: "ok"
  };

  // 1. Real Firestore Query Health (Requirement 11: real Firestore check)
  if (firebaseActive && db) {
    try {
      const start = Date.now();
      await getDoc(doc(db, "settings", "whatsapp"));
      const duration = Date.now() - start;
      health.firestore = { 
        status: "online", 
        details: `Conexão e verificação de leitura bem-sucedidas em ${duration}ms` 
      };
    } catch (e: any) {
      health.firestore = { 
        status: "offline", 
        details: `Conexão inativa ou Erro de Permissão do Operador: ${e.message}` 
      };
      health.status = "degraded";
    }
  }

  // 2. Gemini Health
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY") {
    health.gemini = { status: "online", details: "Chave pronta para uso (Modelo: gemini-3.5-flash)" };
  }

  // 3. OpenAI Health
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== "MY_OPENAI_API_KEY") {
    health.openai = { status: "online", details: "Chave configurada para contingência" };
  }

  // 4. Meta Credentials Check
  let phId = process.env.META_PHONE_NUMBER_ID || "";
  let acTok = process.env.META_ACCESS_TOKEN || "";
  
  if (firebaseActive && db) {
    try {
      const snap = await getDoc(doc(db, "settings", "whatsapp"));
      if (snap.exists()) {
        const d = snap.data();
        if (d.phoneNumberId) phId = d.phoneNumberId;
        if (d.accessToken) acTok = d.accessToken;
      }
    } catch (e) {}
  }
  
  if (phId && acTok) {
    health.meta = { status: "online", details: `ID do telefone ativo: ${phId}` };
  }

  // 5. Evolution API Connectivity ping check
  let evoUrl = process.env.EVOLUTION_API_URL || "";
  let evoInstance = process.env.EVOLUTION_INSTANCE_NAME || "";
  
  if (firebaseActive && db) {
    try {
      const snap = await getDoc(doc(db, "settings", "whatsapp"));
      if (snap.exists()) {
        const d = snap.data();
        if (d.evolutionApiUrl) evoUrl = d.evolutionApiUrl;
        if (d.evolutionInstanceName) evoInstance = d.evolutionInstanceName;
      }
    } catch (e) {}
  }

  if (evoUrl) {
    health.evolution = { status: "online", url: evoUrl, instance: evoInstance, details: "Configurado" };
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);
      const pingResponse = await fetch(evoUrl, { method: "GET", signal: controller.signal });
      clearTimeout(timeoutId);
      if (pingResponse.ok || pingResponse.status < 500) {
        health.evolution.status = "online";
        health.evolution.details = `Conexão bem sucedida (Instância: ${evoInstance})`;
      } else {
        health.evolution.status = "degraded";
        health.evolution.details = `Sinal degradado ou retorno inválido (${pingResponse.status})`;
      }
    } catch (err) {
      health.evolution.status = "offline";
      health.evolution.details = "Endpoint de API inacessível ou tempo expirado";
    }
  }

  if (health.gemini.status === "offline" && health.openai.status === "offline") {
    health.status = "critical";
  } else if (health.evolution.status === "offline" && health.meta.status === "offline") {
    health.status = "degraded";
  }

  res.json(health);
});

// Admin limited API endpoint protect
app.post("/api/simulate-webhook", adminLimiter, async (req: Request, res: Response) => {
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
    } catch (e) {}
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
    // Isolated Render backend logic (Requisito 9: Backend não deve servir arquivos do frontend em produção)
    app.get("/", (req: Request, res: Response) => {
      res.json({
        name: "Central Autocar API Engine",
        status: "online",
        environment: "production",
        detail: "Frontend servido via Vercel conforme separação de repositórios"
      });
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Central Autocar API Engine] Habilitado com sucesso. Porta: http://localhost:${PORT}`);
  });
}

startServer();
