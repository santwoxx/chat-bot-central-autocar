import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Read values from import.meta.env
const apiKey = (import.meta as any).env?.VITE_FIREBASE_API_KEY;
const authDomain = (import.meta as any).env?.VITE_FIREBASE_AUTH_DOMAIN;
const projectId = (import.meta as any).env?.VITE_FIREBASE_PROJECT_ID;
const storageBucket = (import.meta as any).env?.VITE_FIREBASE_STORAGE_BUCKET;
const messagingSenderId = (import.meta as any).env?.VITE_FIREBASE_MESSAGING_SENDER_ID;
const appId = (import.meta as any).env?.VITE_FIREBASE_APP_ID;
const databaseId = (import.meta as any).env?.VITE_FIREBASE_DATABASE_ID || "(default)";

// Fallback is configured so it connects to standard sandbox or local applet if NO env is set
let firebaseConfig: any = {
  apiKey: apiKey || "AIzaSyDXen38LRqBt2qkCkS2nlAPhWVhyZfwDs4",
  authDomain: authDomain || "central-autocar.firebaseapp.com",
  projectId: projectId || "central-autocar",
  storageBucket: storageBucket || "central-autocar.firebasestorage.app",
  messagingSenderId: messagingSenderId || "560659713877",
  appId: appId || "1:560659713877:web:f477790c196e0a8f5c29dc",
  firestoreDatabaseId: databaseId
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || "(default)");
export const auth = getAuth(app);

// Firestore Error Handler complying strictly with the FirestoreErrorInfo metadata JSON format required by guidelines.
export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  
  const errorStr = String(error);
  if (!errorStr.includes("permission") && !errorStr.includes("Missing or insufficient permissions") && !errorStr.includes("permission-denied")) {
    console.error("Firestore Error Detected:", JSON.stringify(errInfo));
  } else {
    console.info(`[Firestore] Acesso restrito em "${path}" ('${operationType}'). Usando modo Sandbox Simulator offline.`);
  }
  throw new Error(JSON.stringify(errInfo));
}
