import { getDoc, doc } from "firebase/firestore";
import { db, firebaseActive } from "../config.ts";

/**
 * Dispatches a WhatsApp Business API message using Meta Cloud Graph API.
 * Safely falls back to simulation mode if no keys are found.
 */
export async function sendWhatsAppMessage(to: string, text: string, buttons?: string[]): Promise<boolean> {
  let phoneNumberId = "";
  let accessToken = "";
  
  if (firebaseActive && db) {
    try {
      const snap = await getDoc(doc(db, "settings", "whatsapp"));
      if (snap.exists()) {
        const data = snap.data();
        phoneNumberId = data.phoneNumberId || "";
        accessToken = data.accessToken || "";
      }
    } catch (e) {
      console.error("[WhatsApp Service] Erro Firestore settings read:", e);
    }
  }

  // Backup from environmental variables
  phoneNumberId = phoneNumberId || process.env.META_PHONE_NUMBER_ID || "";
  accessToken = accessToken || process.env.META_ACCESS_TOKEN || "";

  if (!phoneNumberId || !accessToken) {
    console.log(`[WhatsApp Sandbox SIMULATION] Target: ${to} | Text: "${text}"`);
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

  try {
    const response = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`
      },
      body: JSON.stringify(bodyPayload)
    });
    const resData = await response.json();
    console.log("[WhatsApp Meta Cloud API Response]:", JSON.stringify(resData));
    return response.ok;
  } catch (error) {
    console.error("[WhatsApp Meta Cloud API Dispath Error]:", error);
    return false;
  }
}
