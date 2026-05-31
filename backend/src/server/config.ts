import fs from "fs";
import path from "path";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, onSnapshot, doc } from "firebase/firestore";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

// Firebase initialization
let firebaseConfig: any = null;
let db: any = null;
let firebaseActive = false;
let openaiApiKeyFromFirestore = "";

try {
  // Try several candidate locations for firebase-applet-config.json
  const candidates = [
    path.join(process.cwd(), "firebase-applet-config.json"),
    path.join(process.cwd(), "..", "firebase-applet-config.json"),
    path.join(__dirname, "..", "..", "firebase-applet-config.json"),
    path.join(__dirname, "..", "..", "..", "firebase-applet-config.json")
  ];

  let configPath = "";
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      configPath = c;
      break;
    }
  }

  if (configPath) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const fbApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    db = getFirestore(fbApp, firebaseConfig.firestoreDatabaseId || "(default)");
    firebaseActive = true;
    console.log(`[Firebase Config] Ativo com sucesso usando: ${configPath}`);

    // Listen in real-time to whatsapp settings for extra OpenAI credentials
    const whatsappSettingsDoc = doc(db, "settings", "whatsapp");
    onSnapshot(whatsappSettingsDoc, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.openAiKey) {
          openaiApiKeyFromFirestore = data.openAiKey;
          console.log("[Firebase Config] OpenAI API Key updated/synchronized from Firestore.");
        }
      }
    }, (err) => {
      console.warn("[Firebase Config] Falha ao sintonizar chave OpenAI da Firestore:", err.message);
    });
  } else {
    console.warn("[Firebase Config] Arquivo firebase-applet-config.json nao encontrado nos caminhos. Usando memoria/sandbox.");
  }
} catch (err) {
  console.warn("[Firebase Config] Nao inicializado. Usando memoria/sandbox.");
}

export { db, firebaseActive };

// AI Clients getters (Lazy initialization for Render and security)
let openaiClient: OpenAI | null = null;
export function getOpenAIClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY || openaiApiKeyFromFirestore;
  if (!key || key === "MY_OPENAI_API_KEY" || key.trim() === "") {
    return null;
  }
  if (!openaiClient || openaiClient.apiKey !== key) {
    openaiClient = new OpenAI({ apiKey: key });
  }
  return openaiClient;
}

export function getGeminiClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === "MY_GEMINI_API_KEY" || key.trim() === "") {
    return null;
  }
  try {
    return new GoogleGenAI({ apiKey: key });
  } catch (err) {
    return null;
  }
}
