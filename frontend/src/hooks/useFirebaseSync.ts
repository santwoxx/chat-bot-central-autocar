import { useState, useEffect } from "react";
import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  updateDoc, 
  query, 
  orderBy, 
  limit
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase/config.ts";
import { useAuth } from "../contexts/AuthContext.tsx";
import { Lead, Message, FlowConfig, WebhookSimLog } from "../types.ts";

export function useFirebaseSync(selectedLeadId: string | null) {
  const { profile, isMockMode, setMockMode } = useAuth();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [flowConfig, setFlowConfig] = useState<FlowConfig | null>(null);
  const [stats, setStats] = useState({
    totalLeads: 0,
    aiHandled: 0,
    humanHandled: 0,
    conversationsSaved: 0,
    averageConfidence: 94,
    savedTokens: 0,
    responseTimeSavedSec: 0,
    apiConnected: false
  });
  const [webhookLogs, setWebhookLogs] = useState<WebhookSimLog[]>([]);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);

  // Helper to handle subscription errors and automatically fall back to simulated sandbox mode safely
  const handleSubscriptionError = (error: any, operation: OperationType, path: string) => {
    const errorMsg = error instanceof Error ? error.message : String(error);
    setFirestoreError(errorMsg);
    
    if (
      errorMsg.includes("permission") || 
      errorMsg.includes("Missing or insufficient permissions") || 
      errorMsg.includes("permission-denied")
    ) {
      if (!isMockMode) {
        console.warn(`[Firebase Sync Fallback] Restrição de leitura em "${path}". Ativando Sandbox Simulador local para garantir execução contínua e segura.`);
        // Automatically toggle to local sandbox simulator so no further socket errors spam the console
        setMockMode(true);
      }
    }

    try {
      handleFirestoreError(error, operation, path);
    } catch (e) {
      // Subdued to prevent uncaught runtime exceptions in the browser
    }
  };

  // 1. Synchronize Leads in real-time
  useEffect(() => {
    if (isMockMode || !profile) return;

    const leadsPath = "leads";
    const qLeads = collection(db, leadsPath);

    const unsubscribe = onSnapshot(
      qLeads,
      (snapshot) => {
        const list: Lead[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as Lead);
        });
        // Sort newest first
        list.sort((a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime());
        setLeads(list);
        setFirestoreError(null);
      },
      (error) => {
        handleSubscriptionError(error, OperationType.LIST, leadsPath);
      }
    );

    return () => unsubscribe();
  }, [profile, isMockMode]);

  // 2. Synchronize Messages for chosen lead in real-time
  useEffect(() => {
    if (isMockMode || !profile || !selectedLeadId) {
      setMessages([]);
      return;
    }

    const messagesPath = `leads/${selectedLeadId}/messages`;
    const qMessages = query(collection(db, messagesPath), orderBy("timestamp", "asc"));

    const unsubscribe = onSnapshot(
      qMessages,
      (snapshot) => {
        const list: Message[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as Message);
        });
        setMessages(list);
      },
      (error) => {
        handleSubscriptionError(error, OperationType.LIST, messagesPath);
      }
    );

    return () => unsubscribe();
  }, [selectedLeadId, profile, isMockMode]);

  // 3. Synchronize Flow Configuration in real-time
  useEffect(() => {
    if (isMockMode || !profile) return;

    const flowDocPath = "flows/config";
    const docRef = doc(db, flowDocPath);

    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          setFlowConfig(docSnap.data() as FlowConfig);
        }
      },
      (error) => {
        handleSubscriptionError(error, OperationType.GET, flowDocPath);
      }
    );

    return () => unsubscribe();
  }, [profile, isMockMode]);

  // 4. Synchronize Business Dashboard Metrics in real-time
  useEffect(() => {
    if (isMockMode || !profile) return;

    const statsDocPath = "analytics/current";
    const docRef = doc(db, statsDocPath);

    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setStats({
            totalLeads: data.totalLeads || 0,
            aiHandled: data.aiHandled || 0,
            humanHandled: data.humanHandled || 0,
            conversationsSaved: data.conversationsSaved || 0,
            averageConfidence: data.averageConfidence || 94,
            savedTokens: data.savedTokens || 0,
            responseTimeSavedSec: data.responseTimeSavedSec || 0,
            apiConnected: true
          });
        }
      },
      (error) => {
        handleSubscriptionError(error, OperationType.GET, statsDocPath);
      }
    );

    return () => unsubscribe();
  }, [profile, isMockMode]);

  // 5. Synchronize Webhook logs in real-time
  useEffect(() => {
    if (isMockMode || !profile) return;

    const logsPath = "webhook_logs";
    const qLogs = query(collection(db, logsPath), orderBy("timestamp", "desc"), limit(40));

    const unsubscribe = onSnapshot(
      qLogs,
      (snapshot) => {
        const list: WebhookSimLog[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as WebhookSimLog);
        });
        setWebhookLogs(list);
      },
      (error) => {
        handleSubscriptionError(error, OperationType.LIST, logsPath);
      }
    );

    return () => unsubscribe();
  }, [profile, isMockMode]);

  // Helper Mutation methods:
  const updateLeadModeInFirestore = async (leadId: string, newMode: "AI" | "HUMAN") => {
    if (isMockMode) return false;
    const leadRefPath = `leads/${leadId}`;
    try {
      await updateDoc(doc(db, leadRefPath), {
        mode: newMode,
        currentStep: newMode === "AI" ? "chatting" : "human_escalated"
      });
      return true;
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.WRITE, leadRefPath);
      } catch (e) {}
      return false;
    }
  };

  const addManualMessageToFirestore = async (leadId: string, text: string) => {
    if (isMockMode) return false;
    const leadDocPath = `leads/${leadId}`;
    const messagesPath = `leads/${leadId}/messages`;
    
    try {
      const timestamp = new Date().toISOString();
      const messageId = `msg-${Date.now()}-h`;
      
      // Update Lead metadata
      await updateDoc(doc(db, leadDocPath), {
        lastMessage: text,
        lastMessageTime: timestamp,
        unreadCount: 0
      });

      // Write Message
      await setDoc(doc(db, `${messagesPath}/${messageId}`), {
        id: messageId,
        leadId,
        role: "agent_human",
        text,
        timestamp
      });

      return true;
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.WRITE, messagesPath);
      } catch (e) {}
      return false;
    }
  };

  const saveFlowConfigToFirestore = async (newConfig: FlowConfig) => {
    if (isMockMode) return false;
    const flowDocPath = "flows/config";
    try {
      await setDoc(doc(db, flowDocPath), newConfig, { merge: true });
      return true;
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.WRITE, flowDocPath);
      } catch (e) {}
      return false;
    }
  };

  return {
    leads,
    setLeads,
    messages,
    setMessages,
    flowConfig,
    setFlowConfig,
    stats,
    setStats,
    webhookLogs,
    setWebhookLogs,
    firestoreError,
    setFirestoreError,
    updateLeadModeInFirestore,
    addManualMessageToFirestore,
    saveFlowConfigToFirestore
  };
}
