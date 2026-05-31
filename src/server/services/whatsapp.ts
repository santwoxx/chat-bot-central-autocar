import { getDoc, doc, setDoc, collection, query, where, getDocs, updateDoc } from "firebase/firestore";
import { db, firebaseActive } from "../config.ts";

// Local logs callback helper to synchronize with server webhook logs UI
let writeLocalWebhookLogExternal: ((direction: "INBOUND" | "OUTBOUND", type: string, payload: any) => void) | null = null;
export function registerLogCallback(cb: (direction: "INBOUND" | "OUTBOUND", type: string, payload: any) => void) {
  writeLocalWebhookLogExternal = cb;
}

/**
 * Outbound retry queue interface for high reliability
 */
export interface OutboundQueueItem {
  id: string;
  to: string;
  text: string;
  buttons?: string[];
  attempts: number;
  maxAttempts: number;
  nextAttemptTime: number;
}

// Global in-memory queue
const outboundRetryQueue: OutboundQueueItem[] = [];
let processQueueTimer: NodeJS.Timeout | null = null;

export function getOutboundRetryQueueSize(): number {
  return outboundRetryQueue.length;
}

/**
 * Dispatches a WhatsApp message using Evolution API (QR Code / Baileys).
 * Now has standard 6-second API request timeout wrapper.
 */
async function sendEvolutionMessage(
  to: string,
  text: string,
  buttons: string[] | undefined,
  config: { evolutionApiUrl: string; evolutionApiKey: string; evolutionInstanceName: string }
): Promise<boolean> {
  const baseUrl = config.evolutionApiUrl.replace(/\/$/, "");
  const apiKey = config.evolutionApiKey;
  const instance = config.evolutionInstanceName;

  if (!baseUrl || !apiKey || !instance) {
    console.warn("[Evolution API] Configuração incompleta para envio.");
    return false;
  }

  const useButtons = buttons && buttons.length > 0;
  const url = useButtons 
    ? `${baseUrl}/message/sendButtons/${instance}`
    : `${baseUrl}/message/sendText/${instance}`;

  let bodyPayload: any;
  if (useButtons) {
    bodyPayload = {
      number: to,
      buttons: buttons!.slice(0, 3).map((btn, idx) => ({
        buttonId: `btn_reply_${idx}`,
        buttonText: {
          displayText: btn
        },
        type: 1
      })),
      title: "Central Autocar",
      description: text
    };
  } else {
    bodyPayload = {
      number: to,
      options: {
        delay: 500,
        presence: "composing"
      },
      textMessage: {
        text: text
      }
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": apiKey
      },
      body: JSON.stringify(bodyPayload),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    if (response.ok) {
      console.log("[Evolution API] Mensagem enviada com sucesso.");
      return true;
    } else {
      const errText = await response.text();
      console.error(`[Evolution API] Erro ao enviar (${response.status}):`, errText);
      
      // Contingency: if sendButtons failed (sometimes happens in Baileys updates), try text message fallback
      if (useButtons) {
        console.log("[Evolution API] Tentando reenvio de contingência em formato texto puro...");
        const fallbackText = `${text}\n\n` + buttons!.map((b) => `👉 *${b}*`).join("\n");
        return sendEvolutionMessage(to, fallbackText, undefined, config);
      }
      return false;
    }
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      console.error("[Evolution API] Falha por Timeout de rede (excedeu 6s)");
    } else {
      console.error("[Evolution API] Falha de conexão de rede:", err);
    }
    return false;
  }
}

/**
 * Dispatches a WhatsApp Business API message using Meta Cloud Graph API.
 * Now has standard 6-second API request timeout wrapper.
 */
async function sendMetaMessage(
  to: string,
  text: string,
  buttons: string[] | undefined,
  config: { phoneNumberId: string; accessToken: string }
): Promise<boolean> {
  const { phoneNumberId, accessToken } = config;

  if (!phoneNumberId || !accessToken) {
    console.warn("[Meta API] Configuração incompleta para envio.");
    return false;
  }

  let bodyPayload: any;
  if (buttons && buttons.length > 0) {
    bodyPayload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text },
        action: {
          buttons: buttons.slice(0, 3).map((btn, idx) => ({
            type: "reply",
            reply: {
              id: `btn_reply_${idx}`,
              title: btn.substring(0, 20)
            }
          }))
        }
      }
    };
  } else {
    bodyPayload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body: text }
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`
      },
      body: JSON.stringify(bodyPayload),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    const resData = await response.json();
    console.log("[Meta API] Resposta de envio:", JSON.stringify(resData));
    return response.ok;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      console.error("[Meta API] Falha por Timeout de rede (excedeu 6s)");
    } else {
      console.error("[Meta API] Falha física ao enviar:", error);
    }
    return false;
  }
}

/**
 * Direct WhatsApp message dispatch, without queue scheduling.
 */
async function sendWhatsAppMessageDirect(to: string, text: string, buttons?: string[]): Promise<boolean> {
  let provider: "AUTO" | "EVOLUTION" | "META" = "AUTO";
  let phoneNumberId = process.env.META_PHONE_NUMBER_ID || "";
  let accessToken = process.env.META_ACCESS_TOKEN || "";
  let evolutionApiUrl = process.env.EVOLUTION_API_URL || "";
  let evolutionApiKey = process.env.EVOLUTION_API_KEY || "";
  let evolutionInstanceName = process.env.EVOLUTION_INSTANCE_NAME || "";

  // 1. Carrega configurações do Firestore (Prioritário)
  if (firebaseActive && db) {
    try {
      const snap = await getDoc(doc(db, "settings", "whatsapp"));
      if (snap.exists()) {
        const data = snap.data();
        if (data.provider) provider = data.provider;
        if (data.phoneNumberId) phoneNumberId = data.phoneNumberId;
        if (data.accessToken) accessToken = data.accessToken;
        if (data.evolutionApiUrl) evolutionApiUrl = data.evolutionApiUrl;
        if (data.evolutionApiKey) evolutionApiKey = data.evolutionApiKey;
        if (data.evolutionInstanceName) evolutionInstanceName = data.evolutionInstanceName;
      }
    } catch (e) {
      console.error("[WhatsApp Service] Erro ao ler settings/whatsapp do Firestore:", e);
    }
  }

  // Normaliza o número tirando caracteres não numéricos
  const cleanTo = to.replace(/\D/g, "");

  console.log(`[WhatsApp Outbound Direct] Envia para: ${cleanTo} via Provedor: ${provider}`);

  const evolutionConfig = {
    evolutionApiUrl,
    evolutionApiKey,
    evolutionInstanceName
  };

  const metaConfig = {
    phoneNumberId,
    accessToken
  };

  const hasMeta = !!phoneNumberId && !!accessToken;
  const hasEvolution = !!evolutionApiUrl && !!evolutionApiKey && !!evolutionInstanceName;

  if (!hasMeta && !hasEvolution) {
    console.log(`[WhatsApp SIMULATION Sandbox] Alvo: ${cleanTo} | Conteúdo: "${text}" | Botões: ${buttons?.join(", ")}`);
    if (writeLocalWebhookLogExternal) {
      writeLocalWebhookLogExternal("OUTBOUND", buttons && buttons.length > 0 ? "button" : "text", {
        to: cleanTo,
        text,
        buttons,
        gateway: "SIMULATION"
      });
    }
    return true;
  }

  // 2. Fluxo de Disparo Baseado no Provedor Ativo
  if (provider === "EVOLUTION") {
    const success = await sendEvolutionMessage(cleanTo, text, buttons, evolutionConfig);
    if (writeLocalWebhookLogExternal) {
      writeLocalWebhookLogExternal("OUTBOUND", buttons && buttons.length > 0 ? "button" : "text", {
        to: cleanTo,
        text,
        buttons,
        gateway: "EVOLUTION",
        success
      });
    }
    return success;
  }

  if (provider === "META") {
    const success = await sendMetaMessage(cleanTo, text, buttons, metaConfig);
    if (writeLocalWebhookLogExternal) {
      writeLocalWebhookLogExternal("OUTBOUND", buttons && buttons.length > 0 ? "button" : "text", {
        to: cleanTo,
        text,
        buttons,
        gateway: "META",
        success
      });
    }
    return success;
  }

  // 3. Modo AUTO (Tenta Evolution primeiro e migra para Meta automaticamente em caso de falha)
  if (provider === "AUTO") {
    console.log("[Modo AUTO] Tentando enviar prioritariamente via Evolution API...");
    const evolutionSuccess = await sendEvolutionMessage(cleanTo, text, buttons, evolutionConfig);
    
    if (evolutionSuccess) {
      if (writeLocalWebhookLogExternal) {
        writeLocalWebhookLogExternal("OUTBOUND", buttons && buttons.length > 0 ? "button" : "text", {
          to: cleanTo,
          text,
          buttons,
          gateway: "EVOLUTION",
          mode: "AUTO",
          success: true
        });
      }
      return true;
    }

    // Se falhar, executa transição automática imediata para o Meta
    console.warn("[Modo AUTO] Falha na Evolution API. Ativando fallback automático para Meta Cloud API imediatamente!");
    
    // Log do chaveamento de canais
    const switchLog = `⚠️ [FAILOVER AUTO] Evolution API offline ou instável para o número ${cleanTo}. Canal de contingência Meta Cloud API acionado com sucesso.`;
    console.log(switchLog);

    if (firebaseActive && db) {
      try {
        const logId = `failover-${Date.now()}`;
        await setDoc(doc(db, `webhook_logs/${logId}`), {
          id: logId,
          direction: "OUTBOUND",
          type: "text",
          payload: JSON.stringify({
            event: "PROVIDER_FAILOVER",
            reason: "Evolution API error/timeout",
            activatedGateway: "META",
            targetPhone: cleanTo
          }),
          timestamp: new Date().toISOString()
        });
      } catch (logErr) {
        console.error("[WhatsApp Core] Erro ao gravar log de failover no Firestore:", logErr);
      }
    }

    const metaSuccess = await sendMetaMessage(cleanTo, text, buttons, metaConfig);
    if (writeLocalWebhookLogExternal) {
      writeLocalWebhookLogExternal("OUTBOUND", buttons && buttons.length > 0 ? "button" : "text", {
        to: cleanTo,
        text,
        buttons,
        gateway: "META_FALLBACK",
        mode: "AUTO",
        success: metaSuccess,
        details: "Triggered after Evolution API failed"
      });
    }
    return metaSuccess;
  }

  return false;
}

/**
 * Dispatches a WhatsApp message using active credentials and providers.
 * Supports OUTBOUND retry queues inside production environment to recover from network drops.
 */
export async function sendWhatsAppMessage(to: string, text: string, buttons?: string[]): Promise<boolean> {
  const cleanTo = to.replace(/\D/g, "");
  // Try sending immediately
  const success = await sendWhatsAppMessageDirect(cleanTo, text, buttons);
  if (success) {
    return true;
  }

  // If initial send fails, register to retry queue for resilient background resending
  console.warn(`[WhatsApp Queue Engine] Falha inicial ao despachar para ${cleanTo}. Enfileirando para re-tentativas automáticas.`);
  
  const itemId = `outbound-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const newItem: any = {
    id: itemId,
    to: cleanTo,
    text,
    buttons: buttons || null,
    attempts: 0,
    maxAttempts: 3,
    nextAttemptTime: Date.now() + 15000, // Retry in 15 seconds
    status: "PENDING",
    error: ""
  };

  if (firebaseActive && db) {
    try {
      await setDoc(doc(db, "outbound_queue", itemId), newItem);
      console.log(`[WhatsApp Queue Engine] Salvo na fila persistente Firestore: outbound_queue/${itemId}`);
    } catch (e: any) {
      console.error("[WhatsApp Queue Engine] Falha ao salvar fila no Firestore, usando fallback local:", e.message);
      outboundRetryQueue.push({
        id: itemId,
        to: cleanTo,
        text,
        buttons,
        attempts: 0,
        maxAttempts: 3,
        nextAttemptTime: Date.now() + 15000
      });
    }
  } else {
    outboundRetryQueue.push({
      id: itemId,
      to: cleanTo,
      text,
      buttons,
      attempts: 0,
      maxAttempts: 3,
      nextAttemptTime: Date.now() + 15000
    });
  }

  startOutboundQueueWorker();
  return false;
}

/**
 * Periodically processes scheduled failed dispatches
 */
export function startOutboundQueueWorker() {
  if (processQueueTimer) return;

  console.log("[Outbound Queue Core] Trabalhador de filas de re-tentativa iniciado com sucesso.");
  processQueueTimer = setInterval(async () => {
    const now = Date.now();

    // 1. Process items from Firestore Queue if active
    if (firebaseActive && db) {
      try {
        const qRef = collection(db, "outbound_queue");
        const dueQuery = query(qRef, where("status", "==", "PENDING"));
        const snap = await getDocs(dueQuery);
        
        for (const docSnap of snap.docs) {
          const item = docSnap.data();
          if (item.nextAttemptTime <= now) {
            // Lock document to PROCESSING
            const docRef = doc(db, "outbound_queue", item.id);
            await updateDoc(docRef, { status: "PROCESSING" });

            console.log(`[Outbound Queue Core - Firestore] Tentando re-enviar para ${item.to} (tentativa ${item.attempts + 1}/${item.maxAttempts})...`);
            const success = await sendWhatsAppMessageDirect(item.to, item.text, item.buttons || undefined);

            if (success) {
              await updateDoc(docRef, { status: "COMPLETED", attempts: item.attempts + 1 });
              console.log(`[Outbound Queue Core - Firestore] Envio sucedido para ${item.to}`);
            } else {
              const nextAttempts = item.attempts + 1;
              if (nextAttempts >= item.maxAttempts) {
                await updateDoc(docRef, { status: "FAILED", attempts: nextAttempts, error: "Retries exceeded" });
                console.error(`[Outbound Queue Core - Firestore] Limite de tentativas excedido para ${item.to}`);
                
                // Add webhook error log
                const errLogId = `err-outbound-${Date.now()}`;
                await setDoc(doc(db, `webhook_logs/${errLogId}`), {
                  id: errLogId,
                  direction: "OUTBOUND",
                  type: "text",
                  payload: JSON.stringify({
                    event: "RETRIES_EXCEEDED",
                    reason: `Outbound delivery failed completely after ${item.maxAttempts} attempts.`,
                    targetPhone: item.to,
                    text: item.text,
                    buttons: item.buttons
                  }),
                  timestamp: new Date().toISOString()
                });
              } else {
                const newDelay = 15000 * Math.pow(2, nextAttempts);
                await updateDoc(docRef, {
                  status: "PENDING",
                  attempts: nextAttempts,
                  nextAttemptTime: Date.now() + newDelay
                });
                console.log(`[Outbound Queue Core - Firestore] Falha. Agendada nova tentativa para ${item.to} em ${newDelay/1000}s`);
              }
            }
          }
        }
      } catch (err: any) {
        console.error("[Outbound Queue Core - Firestore] Erro ao iterar fila do Firestore:", err.message);
      }
    }

    // 2. Process local memory queue items
    const dueLocalItems = outboundRetryQueue.filter(item => item.nextAttemptTime <= now);
    for (const item of dueLocalItems) {
      const idx = outboundRetryQueue.indexOf(item);
      if (idx > -1) {
        outboundRetryQueue.splice(idx, 1);
      }

      console.log(`[Outbound Queue Core - Memory] Executando tentativa ${item.attempts + 1}/${item.maxAttempts} para ${item.to}...`);
      const success = await sendWhatsAppMessageDirect(item.to, item.text, item.buttons);

      if (success) {
        console.log(`[Outbound Queue Core - Memory] Mensagem enviada com sucesso para ${item.to}!`);
      } else {
        const nextAttempts = item.attempts + 1;
        if (nextAttempts >= item.maxAttempts) {
          console.error(`[Outbound Queue Core - Memory] Mensagem descartada. Limite excedido para ${item.to}`);
        } else {
          const newDelay = 15000 * Math.pow(2, nextAttempts);
          item.attempts = nextAttempts;
          item.nextAttemptTime = Date.now() + newDelay;
          outboundRetryQueue.push(item);
          console.log(`[Outbound Queue Core - Memory] Falha residual. Agendada em ${newDelay / 1000}s.`);
        }
      }
    }
  }, 10000);
}

// Start queue automatic processing worker immediately
startOutboundQueueWorker();
