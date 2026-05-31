import React, { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar.tsx";
import LeadCard from "./components/LeadCard.tsx";
import ChatWindow from "./components/ChatWindow.tsx";
import FlowEditor from "./components/FlowEditor.tsx";
import StatsDashboard from "./components/StatsDashboard.tsx";
import SimulatorPhone from "./components/SimulatorPhone.tsx";

import { Message, Lead, StorePreset, FlowConfig, WebhookSimLog } from "./types.ts";
import { MessageSquare, Bot, BellRing, Settings, Sparkles, LogOut, ChevronRight, CheckCircle2, ShieldCheck, Smartphone } from "lucide-react";
import { useAuth } from "./contexts/AuthContext.tsx";
import { useFirebaseSync } from "./hooks/useFirebaseSync.ts";

export default function App() {
  const { user, profile, signInWithEmail, signInWithGoogle, signOutUser, createDemoCompanyAndUser, isMockMode, setMockMode, loading, firestorePermissionError } = useAuth();
  
  const [activeTab, setActiveTab ] = useState<"chats" | "flow" | "stats">("chats");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  
  // Real-time Firestore or offline hooks integration
  const {
    leads: fbLeads,
    messages: fbMessages,
    flowConfig: fbFlowConfig,
    stats: fbStats,
    webhookLogs: fbWebhookLogs,
    updateLeadModeInFirestore,
    addManualMessageToFirestore,
    saveFlowConfigToFirestore,
    firestoreError
  } = useFirebaseSync(selectedLead?.id || null);

  // Fallback states for simulation / mock modes
  const [localLeads, setLocalLeads] = useState<Lead[]>([]);
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [localFlowConfig, setLocalFlowConfig] = useState<FlowConfig | null>(null);
  const [localStats, setLocalStats] = useState({
    totalLeads: 0,
    aiHandled: 0,
    humanHandled: 0,
    conversationsSaved: 0,
    averageConfidence: 94,
    savedTokens: 0,
    responseTimeSavedSec: 0,
    apiConnected: false
  });
  const [localWebhookLogs, setLocalWebhookLogs] = useState<WebhookSimLog[]>([]);

  const [stores, setStores] = useState<StorePreset[]>([]);
  const [notification, setNotification] = useState<string | null>(null);
  const [showRulesModal, setShowRulesModal] = useState(false);

  // Login credentials states
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const playChime = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc1.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc1.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.15); // G5
      
      osc2.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
      osc2.frequency.exponentialRampToValueAtTime(987.77, ctx.currentTime + 0.15); // B5
      
      osc1.type = "sine";
      osc2.type = "sine";
      
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
      
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);
      
      osc1.start();
      osc2.start();
      
      osc1.stop(ctx.currentTime + 0.6);
      osc2.stop(ctx.currentTime + 0.6);
    } catch (e) {
      console.warn("Chime blocked on user gesture restriction:", e);
    }
  };

  const triggerAlarmNotification = (msg: string) => {
    setNotification(msg);
    playChime();
    setTimeout(() => {
      setNotification(null);
    }, 5500);
  };

  // Main local initial loader (used during mock mode)
  const loadLocalInitialData = async () => {
    try {
      const [leadsRes, configRes, storesRes, statsRes, logsRes] = await Promise.all([
        fetch("/api/leads"),
        fetch("/api/flow-config"),
        fetch("/api/stores"),
        fetch("/api/stats"),
        fetch("/api/webhook-logs")
      ]);

      const [leadsData, configData, storesData, statsData, logsData] = await Promise.all([
        leadsRes.json(),
        configRes.json(),
        storesRes.json(),
        statsRes.json(),
        logsRes.json()
      ]);

      setLocalLeads(leadsData);
      setLocalFlowConfig(configData);
      setStores(storesData);
      setLocalStats(statsData);
      setLocalWebhookLogs(logsData);

      if (leadsData.length > 0 && !selectedLead) {
        setSelectedLead(leadsData[0]);
      }
    } catch (err) {
      console.error("Erro ao carregar dados locais:", err);
    }
  };

  const loadLocalMessages = async (leadId: string) => {
    try {
      const res = await fetch(`/api/leads/${leadId}/messages`);
      const data = await res.json();
      setLocalMessages(data);
    } catch (err) {
      console.error("Erro ao carregar mensagens locais:", err);
    }
  };

  // Always load stores list (provided statically from server)
  useEffect(() => {
    fetch("/api/stores")
      .then(res => res.json())
      .then(data => setStores(data))
      .catch(err => console.error("Erro ao carregar lojas:", err));
  }, []);

  // Sync loader coordination
  useEffect(() => {
    if (user && !isMockMode) {
      // If fully authenticated to Firestore, default lead selection on loaded
      if (fbLeads.length > 0 && !selectedLead) {
        setSelectedLead(fbLeads[0]);
      }
    } else if (user && isMockMode) {
      loadLocalInitialData();
    }
  }, [user, isMockMode, fbLeads]);

  useEffect(() => {
    if (selectedLead && isMockMode) {
      loadLocalMessages(selectedLead.id);
    }
  }, [selectedLead, isMockMode]);

  // Unified data accessors switching between Real Firebase or simulated Sandbox Modes
  const leads = isMockMode ? localLeads : fbLeads;
  const messages = isMockMode ? localMessages : fbMessages;
  const flowConfig = isMockMode ? localFlowConfig : fbFlowConfig;
  const stats = isMockMode ? localStats : fbStats;
  const webhookLogs = isMockMode ? localWebhookLogs : fbWebhookLogs;

  // Monitor incoming client-messages and human escalation triggers for instant UI alert and sound play
  const lastLeadsState = React.useRef<Record<string, { lastMessageTime: string; unreadCount: number; mode: string }>>({});
  const lastSelectedLeadId = React.useRef<string | null>(null);
  const lastMessagesLength = React.useRef<number>(0);

  useEffect(() => {
    if (!user || leads.length === 0) {
      const initial: Record<string, { lastMessageTime: string; unreadCount: number; mode: string }> = {};
      leads.forEach(l => {
        initial[l.id] = { lastMessageTime: l.lastMessageTime, unreadCount: l.unreadCount, mode: l.mode };
      });
      lastLeadsState.current = initial;
      return;
    }

    let alertTriggered = false;

    // Iterate over leads to check transitions and new client messages
    leads.forEach(l => {
      const prev = lastLeadsState.current[l.id];
      if (!prev) {
        // Brand new lead in past minutes -> trigger notification!
        const timeDiffMs = Math.abs(Date.now() - new Date(l.lastMessageTime).getTime());
        if (timeDiffMs < 120000) {
          triggerAlarmNotification(`🚗 Novo Lead: ${l.name} iniciou cotação!`);
          alertTriggered = true;
        }
      } else {
        const modeChangedToHuman = prev.mode === "AI" && l.mode === "HUMAN";
        const timeChanged = prev.lastMessageTime !== l.lastMessageTime;
        const unreadIncreased = l.unreadCount > prev.unreadCount;

        if (modeChangedToHuman) {
          triggerAlarmNotification(`🚨 ATENDIMENTO HUMANO EXIGIDO: ${l.name} acionou transição automática comercial!`);
          alertTriggered = true;
        } else if (timeChanged) {
          // If unread count increased, meaning we received a client message in a background lead conversation
          if (unreadIncreased) {
            triggerAlarmNotification(`💬 Mensagem de ${l.name}: "${l.lastMessage}"`);
            alertTriggered = true;
          } else if (selectedLead?.id !== l.id) {
            // Unread count did not increase (e.g. system is doing automatic updates), but we have a valid user-looking message
            const autoMsg = l.lastMessage.startsWith("🤖") || l.lastMessage.startsWith("⚠️") || l.lastMessage.includes("Central de Atendimento");
            if (!autoMsg) {
              triggerAlarmNotification(`💬 Mensagem de ${l.name}: "${l.lastMessage}"`);
              alertTriggered = true;
            }
          }
        }
      }
    });

    // Handle selected lead messages array expansion
    if (selectedLead) {
      if (lastSelectedLeadId.current === selectedLead.id) {
        if (messages.length > lastMessagesLength.current) {
          const newMsgs = messages.slice(lastMessagesLength.current);
          const hasUserInbound = newMsgs.some(m => m.role === "user");
          if (hasUserInbound && !alertTriggered) {
            const lastUserMsg = [...newMsgs].reverse().find(m => m.role === "user");
            if (lastUserMsg) {
              triggerAlarmNotification(`💬 Mensagem de ${selectedLead.name}: "${lastUserMsg.text}"`);
              alertTriggered = true;
            }
          }
        }
      }
      lastSelectedLeadId.current = selectedLead.id;
      lastMessagesLength.current = messages.length;
    } else {
      lastSelectedLeadId.current = null;
      lastMessagesLength.current = 0;
    }

    // Keep history tracking updated
    const current: Record<string, { lastMessageTime: string; unreadCount: number; mode: string }> = {};
    leads.forEach(l => {
      current[l.id] = { lastMessageTime: l.lastMessageTime, unreadCount: l.unreadCount, mode: l.mode };
    });
    lastLeadsState.current = current;

  }, [leads, messages, selectedLead, user]);

  // React polling (only triggered when in mock mode)
  useEffect(() => {
    if (!isMockMode || !user) return;

    const timer = setInterval(async () => {
      try {
        const [leadsRes, statsRes, logsRes] = await Promise.all([
          fetch("/api/leads"),
          fetch("/api/stats"),
          fetch("/api/webhook-logs")
        ]);

        const leadsData = await leadsRes.json();
        const statsData = await statsRes.json();
        const logsData = await logsRes.json();

        setLocalLeads(leadsData);
        setLocalStats(statsData);
        setLocalWebhookLogs(logsData);

        if (selectedLead) {
          const updated = leadsData.find((l: Lead) => l.id === selectedLead.id);
          if (updated) {
            setSelectedLead(updated);
            loadLocalMessages(updated.id);
          }
        }
      } catch (err) {}
    }, 2500);

    return () => clearInterval(timer);
  }, [selectedLead, isMockMode, user]);

  // Mutation Actions
  const handleSendMessage = async (text: string) => {
    if (!selectedLead) return;

    if (!isMockMode) {
      // Direct Firestore sync action
      await addManualMessageToFirestore(selectedLead.id, text);
      
      // Also post to production webhook routing for physical dispatch simulation
      await fetch(`/api/leads/${selectedLead.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
    } else {
      // Local mockup backend storage flow
      const res = await fetch(`/api/leads/${selectedLead.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
      if (res.ok) {
        loadLocalMessages(selectedLead.id);
        const lRes = await fetch("/api/leads");
        const lData = await lRes.json();
        setLocalLeads(lData);
      }
    }
  };

  const handleToggleMode = async () => {
    if (!selectedLead) return;

    if (!isMockMode) {
      const nextMode = selectedLead.mode === "AI" ? "HUMAN" : "AI";
      await updateLeadModeInFirestore(selectedLead.id, nextMode);
    } else {
      const res = await fetch(`/api/leads/${selectedLead.id}/toggle-mode`, {
        method: "POST"
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedLead(data.lead);
        loadLocalMessages(selectedLead.id);
        const lRes = await fetch("/api/leads");
        const lData = await lRes.json();
        setLocalLeads(lData);
      }
    }
  };

  const handleIncomingSimulate = async (phone: string, text: string, isButton: boolean = false) => {
    try {
      const res = await fetch("/api/simulate-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          senderPhone: phone, 
          text, 
          isButton,
          isMockMode
        })
      });
      const data = await res.json();
      
      if (data.success) {
        if (data.alertTriggered) {
          triggerAlarmNotification(`🔔 Transição Comercial: O cliente demonstrou intenção de compra e transmutou para atendimento humano!`);
        }
        if (isMockMode) {
          await loadLocalInitialData();
          if (selectedLead) {
            await loadLocalMessages(selectedLead.id);
          }
        }
      }
    } catch (err) {
      console.error("Erro no webhook simulador:", err);
    }
  };

  const handleSimulateNewLead = async (name: string, phone: string, car: string, year: string, parts: string) => {
    try {
      const res = await fetch("/api/simulate-new-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          name, 
          phone, 
          car, 
          year, 
          parts,
          isMockMode
        })
      });
      if (res.ok) {
        const data = await res.json();
        triggerAlarmNotification(`🚗 Novo Lead: ${name} (+${phone.slice(-4)}) iniciou cotação!`);
        
        if (isMockMode) {
          await loadLocalInitialData();
        }
        setSelectedLead(data.lead);
        setActiveTab("chats");
      }
    } catch (err) {
      console.error("Erro ao simular novo lead:", err);
    }
  };

  const handleSaveConfig = async (newConfig: FlowConfig) => {
    if (!isMockMode) {
      await saveFlowConfigToFirestore(newConfig);
    } else {
      const res = await fetch("/api/flow-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newConfig)
      });
      if (res.ok) {
        const data = await res.json();
        setLocalFlowConfig(data.flowConfig);
        loadLocalInitialData();
      }
    }
  };

  const handleClearLogs = async () => {
    if (isMockMode) {
      const res = await fetch("/api/webhook-logs/clear", { method: "POST" });
      if (res.ok) {
        setLocalWebhookLogs([]);
      }
    }
  };

  const activeStore = stores.find(s => s.id === flowConfig?.activeStoreId) || stores[0] || {
    id: "jal",
    name: "Jal Autopeças - Itabuna",
    address: "Av. José Soares Pinheiro, 298",
    phone: "(73) 3214-2450",
    workingHours: "8:00 às 17:30",
    specialties: ["Freios", "Suspensão"],
    features: ["Balcão físico", "Retirada em loja"]
  };

  // Rendering Loading view
  if (loading) {
    return (
      <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center text-slate-100 font-sans">
        <Bot className="w-12 h-12 text-yellow-400 animate-spin mb-4" />
        <p className="text-[10px] font-mono tracking-widest text-slate-400">CARREGANDO CENTRAL AUTOCAR...</p>
      </div>
    );
  }

  // Rendering beautiful Central Autocar Authentication page
  if (!user || !profile) {
    const handleLoginSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoginError("");
      if (!loginEmail || !loginPassword) {
        setLoginError("Por favor, preencha todos os campos.");
        return;
      }
      try {
        await signInWithEmail(loginEmail, loginPassword);
      } catch (err: any) {
        console.error("Erro ao autenticar:", err);
        if (err?.code === "auth/user-not-found" || err?.code === "auth/wrong-password" || err?.code === "auth/invalid-credential") {
          setLoginError("E-mail ou senha incorretos. Por favor, verifique ou tente o acesso sandbox.");
        } else if (err?.code === "auth/network-request-failed") {
          setLoginError("Falha de rede. Verifique sua conexão com o Firebase.");
        } else {
          setLoginError(err?.message || "Ocorreu um erro ao entrar no painel.");
        }
      }
    };

    const handleGoogleSignInSubmit = async () => {
      setLoginError("");
      try {
        await signInWithGoogle();
      } catch (err: any) {
        console.error("Erro Google Sign-In:", err);
        if (err?.code === "auth/popup-closed-by-user") {
          setLoginError("Login cancelado: você fechou a janela do Google.");
        } else if (err?.code === "auth/popup-blocked") {
          setLoginError("O pop-up de login do Google foi bloqueado pelo seu navegador.");
        } else {
          setLoginError(err?.message || "Ocorreu um erro ao realizar o login com Google.");
        }
      }
    };

    const handleSandboxBypass = () => {
      createDemoCompanyAndUser("Central Autocar", "Operador Central", "contato@centralautocar.com.br");
    };

    return (
      <div className="h-screen w-screen bg-gradient-to-br from-slate-950 via-slate-900 to-black flex items-center justify-center p-4 overflow-y-auto font-sans">
        <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          
          {/* Brand/Product marketing half */}
          <div className="p-8 md:p-12 bg-gradient-to-br from-yellow-500/10 via-slate-950 to-slate-900/40 flex flex-col justify-between border-r border-slate-800">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Bot className="w-8 h-8 text-yellow-400" />
                <span className="font-bold text-sm tracking-widest text-white font-mono uppercase">Central Autocar</span>
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight leading-snug">
                Painel Administrativo & Assistente Virtual Inteligente
              </h1>
              <p className="text-xs text-slate-400 leading-relaxed">
                Central de atendimento integrada por IA adaptativa para cotações instantâneas de autopeças e marcas no WhatsApp.
              </p>
            </div>

            <div className="pt-4 border-t border-slate-800 flex items-center gap-2 text-[10px] text-slate-500 font-mono">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>SISTEMA CENTRAL CENTRAL AUTOCAR ATIVO</span>
            </div>
          </div>

          {/* Action forms half */}
          <div className="p-8 md:p-12 flex flex-col justify-center space-y-6 bg-slate-900">
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-white">Acesse o Painel</h2>
              <p className="text-xs text-slate-400">Entre de forma segura ou crie sua conta instantaneamente</p>
            </div>

            {loginError && (
              <div className="bg-rose-500/15 border border-rose-500/30 text-rose-300 p-3 rounded-xl text-xs leading-relaxed">
                {loginError}
              </div>
            )}

            <div className="space-y-4">
              <button
                type="button"
                onClick={handleGoogleSignInSubmit}
                className="w-full py-3.5 bg-white hover:bg-slate-100 text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-2.5 transition-all shadow-md cursor-pointer uppercase tracking-wider"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Entrar ou Registrar com Google
              </button>
            </div>
            
            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-slate-800"></div>
              <span className="flex-shrink mx-4 text-slate-500 font-mono text-[10px] uppercase">Ou use sem credenciais</span>
              <div className="flex-grow border-t border-slate-800"></div>
            </div>

            <button
              type="button"
              onClick={handleSandboxBypass}
              className="w-full py-3 bg-slate-800 hover:bg-slate-700 hover:text-white text-slate-300 font-medium text-xs rounded-xl transition-all border border-slate-700 cursor-pointer"
            >
              Acessar via Sandbox Local (Modo Demonstração)
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Active Authenticated Application Dashboard Layout
  return (
    <div className="h-screen w-screen bg-slate-100 flex flex-col font-sans select-none overflow-hidden" id="app-root-container">
      
      {/* Real-time system status banner */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-2 flex items-center justify-between text-xs shrink-0 select-none">
        <div className="flex items-center gap-3">
          <Bot className="w-5 h-5 text-yellow-450 text-yellow-400" />
          <div className="flex items-center gap-2">
            <span className="font-bold text-white tracking-tight">Central Autocar</span>
            <span className="text-[9px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-mono font-bold">SISTEMA CENTRAL</span>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isMockMode ? "bg-amber-400 animate-pulse" : "bg-emerald-500"}`}></span>
            <span className="text-slate-400 font-mono text-[10px] uppercase">
              {isMockMode ? "Modo Demonstrativo Sandbox (Offline)" : "Conectado Firestore Prod (Real-time)"}
            </span>
          </div>
          
          <div className="flex items-center gap-2 pl-4 border-l border-slate-800 text-slate-300 font-medium">
            <span className="text-xs truncate max-w-32">{profile.name}</span>
            <button
              onClick={signOutUser}
              title="Fazer Logout"
              className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {firestorePermissionError && (
        <div className="bg-rose-600 text-white px-6 py-3 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-rose-700 text-xs shrink-0 font-sans z-50 shadow-md">
          <div className="flex items-start gap-2.5">
            <span className="p-1 bg-rose-700 rounded-lg shrink-0 text-white font-bold animate-pulse">⚠️</span>
            <div className="space-y-0.5">
              <p className="font-bold text-[12px] tracking-tight text-white flex items-center gap-1.5">
                Conexão Firestore Restrita (Permissão Negada)
              </p>
              <p className="text-rose-100 text-[11px] leading-normal font-medium">
                Sua conta <strong className="text-white underline">{profile?.email || user?.email}</strong> está logada, mas o banco de dados do seu projeto <strong className="text-white">"central-autocar"</strong> está bloqueando o acesso do Painel. Isso ocorre porque as regras de segurança padrão do Firestore estão configuradas para negar tudo por padrão. Você pode visualizar e colar as regras necessárias para produção agora!
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2 md:mt-0 shrink-0">
            <button
              onClick={() => setShowRulesModal(true)}
              className="px-3 py-1.5 bg-white text-slate-950 font-bold rounded-lg hover:bg-slate-100 transition-all cursor-pointer font-sans text-[10px] tracking-wide shadow-md uppercase active:scale-95"
            >
              Ver e Copiar Regras do Firestore
            </button>
            <button
              onClick={async () => {
                if (user) {
                  setMockMode(false);
                  try {
                    const { doc, getDoc } = await import("firebase/firestore");
                    const { db } = await import("./firebase/config.ts");
                    const snap = await getDoc(doc(db, "users", user.uid));
                    if (snap.exists()) {
                      window.location.reload();
                    }
                  } catch (e) {
                    setMockMode(true);
                  }
                }
              }}
              className="px-3 py-1.5 bg-slate-900 border border-slate-700 text-white font-bold rounded-lg hover:bg-slate-800 transition-all cursor-pointer font-sans text-[10px] tracking-wide uppercase active:scale-95"
            >
              🔄 Sincronizar Novamente
            </button>
          </div>
        </div>
      )}

      {firestoreError && !isMockMode && !firestorePermissionError && (
        <div className="bg-amber-500 text-slate-950 px-6 py-2.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-amber-600 text-xs shrink-0 font-sans z-50">
          <div className="flex items-center gap-2">
            <span className="font-bold shrink-0">⚠️ Restrição do Firestore ({profile?.email || "Usuário"}):</span>
            <span className="text-slate-900 leading-normal">
              O projeto está vinculado ao Firebase, mas faltam regras de segurança liberadas para listas de 'leads' e 'webhook_logs'. Você pode clicar ao lado para testar 100% das ferramentas e simulações do painel imediatamente!
            </span>
          </div>
          <button
            onClick={() => setMockMode(true)}
            className="px-3.5 py-1.5 bg-slate-950 text-white font-bold rounded-lg hover:bg-slate-800 transition-all cursor-pointer shrink-0 font-mono text-[10px] tracking-wide active:scale-95 shadow-md shadow-slate-950/20 uppercase"
          >
            Ativar Modo Simulado (Sandbox)
          </button>
        </div>
      )}

      {showRulesModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full flex flex-col max-h-[85vh] shadow-2xl">
            <div className="p-5 border-b border-slate-800 flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-bold text-sm text-white uppercase tracking-wider">Regras de Segurança do Firestore</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Copie o código abaixo e cole no painel do seu Firebase Console para liberar o sistema de produção.</p>
              </div>
              <button 
                onClick={() => setShowRulesModal(false)}
                className="p-1 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] font-bold font-mono rounded-lg transition-colors cursor-pointer uppercase"
              >
                Fechar
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="space-y-1.5">
                <span className="text-[10px] font-mono tracking-widest text-slate-500 uppercase block">Instruções de Instalação:</span>
                <ol className="list-decimal pl-4 text-[11px] text-slate-300 space-y-1 leading-relaxed font-medium">
                  <li>Acesse o <a href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer" className="text-yellow-400 underline hover:text-yellow-350">Firebase Console</a>.</li>
                  <li>Selecione o projeto <strong className="text-white">"central-autocar"</strong>.</li>
                  <li>No menu lateral esquerdo, clique em <strong className="text-white">Firestore Database</strong>.</li>
                  <li>Clique na aba <strong className="text-white">Rules (Regras)</strong> no topo.</li>
                  <li>Substitua todo o conteúdo existente pelo código abaixo.</li>
                  <li>Clique no botão azul <strong className="text-white">Publish (Publicar)</strong> no canto superior direito.</li>
                  <li>Depois de publicado, clique em <strong className="text-yellow-400">"Simulei, Sincronizar!"</strong> abaixo para habilitar o modo de produção em tempo real!</li>
                </ol>
              </div>

              <div className="relative">
                <span className="text-[10px] font-mono tracking-widest text-slate-500 uppercase block mb-1">Código das Regras (firestore.rules):</span>
                <div className="bg-slate-950 font-mono text-[10px] p-3.5 rounded-xl border border-slate-800 text-slate-300 overflow-x-auto max-h-56 leading-relaxed whitespace-pre select-all">
{`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Global Safety Net - Catch-all default deny
    match /{document=**} {
      allow read, write: if false;
    }

    // Primitive and general validators
    function isSignedIn() {
      return request.auth != null;
    }

    function isValidId(id) {
      return id is string && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\\\-+() ]+$');
    }

    function isUserInDb() {
      return exists(/databases/$(database)/documents/users/$(request.auth.uid));
    }

    function getUserRole() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role;
    }

    function isAdmin() {
      return isSignedIn() && (
        (request.auth.token.email == "natanmarinhocontateste@gmail.com") ||
        (request.auth.token.email == "brisasofc@gmail.com") ||
        (isUserInDb() && getUserRole() == "admin")
      );
    }

    // Operators and Admins both have standard list/read/write permissions
    function isOperador() {
      return isSignedIn() && (
        (request.auth.token.email == "natanmarinhocontateste@gmail.com") ||
        (request.auth.token.email == "brisasofc@gmail.com") ||
        (isUserInDb() && (getUserRole() == "operador" || getUserRole() == "admin"))
      );
    }

    function isValidUser(data) {
      return data.uid is string && data.uid.size() <= 128 &&
             data.email is string && data.email.size() <= 320 &&
             data.name is string && data.name.size() <= 200 &&
             data.role in ['admin', 'operador'] &&
             data.status in ['online', 'offline'];
    }

    function isValidLead(data) {
      return data.id is string && data.id.size() <= 128 &&
             data.name is string && data.name.size() <= 250 &&
             data.phone is string && data.phone.size() <= 32 &&
             data.lastMessage is string && data.lastMessage.size() <= 5000 &&
             data.mode in ['AI', 'HUMAN'] &&
             data.currentStep in ['opt_in', 'chatting', 'human_escalated'] &&
             data.unreadCount is int && data.unreadCount >= 0 &&
             data.avatarColor is string && data.avatarColor.size() <= 64;
    }

    function isValidMessage(data) {
      return data.id is string && data.id.size() <= 128 &&
             data.leadId is string && data.leadId.size() <= 128 &&
             data.role in ['user', 'assistant', 'system_alert', 'agent_human'] &&
             data.text is string && data.text.size() <= 10000;
    }

    function isValidFlowConfig(data) {
      return data.optInText is string && data.optInText.size() <= 10000 &&
             data.optInButtons is list && data.optInButtons.size() <= 10 &&
             data.aiGreeting is string && data.aiGreeting.size() <= 10000 &&
             data.aiSystemPrompt is string && data.aiSystemPrompt.size() <= 30000 &&
             data.escalationKeywords is list && data.escalationKeywords.size() <= 100 &&
             data.activeStoreId is string && data.activeStoreId.size() <= 64;
    }

    function isValidWhatsAppConfig(data) {
      return data.phoneNumberId is string && data.phoneNumberId.size() <= 128 &&
             data.accessToken is string && data.accessToken.size() <= 1000 &&
             data.verifyToken is string && data.verifyToken.size() <= 128 &&
             data.useOpenAi is bool &&
             data.openAiKey is string && data.openAiKey.size() <= 500;
    }

    function isValidAnalytics(data) {
      return data.totalLeads is int && data.totalLeads >= 0 &&
             data.aiHandled is int && data.aiHandled >= 0 &&
             data.humanHandled is int && data.humanHandled >= 0 &&
             data.conversationsSaved is int && data.conversationsSaved >= 0 &&
             data.averageConfidence is int && data.averageConfidence >= 0 &&
             data.savedTokens is int && data.savedTokens >= 0 &&
             data.responseTimeSavedSec is int && data.responseTimeSavedSec >= 0;
    }

    // MATCH BLOCKS

    // User Profile matching
    match /users/{userId} {
      allow read: if isSignedIn() && (request.auth.uid == userId || isAdmin());
      allow create: if isSignedIn() && request.auth.uid == userId && isValidUser(request.resource.data);
      allow update: if isSignedIn() && (request.auth.uid == userId || isAdmin()) && isValidUser(request.resource.data) &&
                     (isAdmin() || (request.resource.data.role == resource.data.role));
    }

    // Leads database root
    match /leads/{leadId} {
      allow list: if isOperador();
      allow get: if isOperador() && isValidId(leadId);
      allow create, write, update: if isOperador() && isValidId(leadId) && isValidLead(request.resource.data);
    }

    // Messages history inside specific leads subcollection
    match /leads/{leadId}/messages/{messageId} {
      allow list: if isOperador() && isValidId(leadId);
      allow get: if isOperador() && isValidId(leadId) && isValidId(messageId);
      allow create, write, update: if isOperador() && isValidId(leadId) && isValidId(messageId) && isValidMessage(request.resource.data);
    }

    // Global Interactive configuration flow (Anti ban, Opt-In definitions)
    match /flows/config {
      allow read: if isOperador();
      allow create, write, update: if isOperador() && isValidFlowConfig(request.resource.data);
    }

    // Meta parameters and credentials config
    match /settings/whatsapp {
      allow read: if isOperador();
      allow create, write, update: if isOperador() && isValidWhatsAppConfig(request.resource.data);
    }

    // Current general operation logs
    match /analytics/current {
      allow read: if isOperador();
      allow create, write, update: if isOperador() && isValidAnalytics(request.resource.data);
    }

    // Webhook event logs
    match /webhook_logs/{logId} {
      allow list: if isOperador();
      allow get: if isOperador() && isValidId(logId);
      allow create, write, update: if isOperador() && isValidId(logId) && ((request.resource != null && request.resource.data != null) ? isValidWebhookLog(request.resource.data) : true);
    }
  }
}`}
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Global Safety Net - Catch-all default deny
    match /{document=**} {
      allow read, write: if false;
    }

    // Primitive and general validators
    function isSignedIn() {
      return request.auth != null;
    }

    function isValidId(id) {
      return id is string && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\\\-+() ]+$');
    }

    function isUserInDb() {
      return exists(/databases/$(database)/documents/users/$(request.auth.uid));
    }

    function getUserRole() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role;
    }

    function isAdmin() {
      return isSignedIn() && (
        (request.auth.token.email == "natanmarinhocontateste@gmail.com") ||
        (request.auth.token.email == "brisasofc@gmail.com") ||
        (isUserInDb() && getUserRole() == "admin")
      );
    }

    // Operators and Admins both have standard list/read/write permissions
    function isOperador() {
      return isSignedIn() && (
        (request.auth.token.email == "natanmarinhocontateste@gmail.com") ||
        (request.auth.token.email == "brisasofc@gmail.com") ||
        (isUserInDb() && (getUserRole() == "operador" || getUserRole() == "admin"))
      );
    }

    // MATCH BLOCKS

    // User Profile matching
    match /users/{userId} {
      allow read: if isSignedIn() && (request.auth.uid == userId || isAdmin());
      allow create: if isSignedIn() && request.auth.uid == userId;
      allow update: if isSignedIn() && (request.auth.uid == userId || isAdmin());
    }

    // Leads database root
    match /leads/{leadId} {
      allow list, get: if isOperador();
      allow create, write, update: if isOperador();
    }

    // Messages history inside specific leads subcollection
    match /leads/{leadId}/messages/{messageId} {
      allow list, get: if isOperador();
      allow create, write, update: if isOperador();
    }

    // Global Interactive configuration flow (Anti ban, Opt-In definitions)
    match /flows/config {
      allow read, create, write, update: if isOperador();
    }

    // Meta parameters and credentials config
    match /settings/whatsapp {
      allow read, create, write, update: if isOperador();
    }

    // Current general operation logs
    match /analytics/current {
      allow read, create, write, update: if isOperador();
    }

    // Webhook event logs
    match /webhook_logs/{logId} {
      allow list, get: if isOperador();
      allow create, write, update: if isOperador();
    }
  }
}`);
                    alert("Regras copiadas para a área de transferência!");
                  }}
                  className="absolute bottom-2.5 right-2.5 px-3 py-1 bg-yellow-400 hover:bg-yellow-350 text-slate-950 text-[10px] font-bold font-sans rounded-lg transition-all shadow-md uppercase cursor-pointer"
                >
                  📋 Copiar Código
                </button>
              </div>
            </div>
            <div className="p-5 border-t border-slate-800 flex justify-end gap-2.5 shrink-0">
              <button
                onClick={() => setShowRulesModal(false)}
                className="px-3.5 py-2 bg-slate-800 text-slate-350 font-bold rounded-lg hover:bg-slate-700 transition-all font-sans text-[11px] uppercase cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  setShowRulesModal(false);
                  window.location.reload();
                }}
                className="px-3.5 py-2 bg-yellow-400 hover:bg-yellow-350 text-slate-950 font-bold rounded-lg transition-all font-sans text-[11px] uppercase cursor-pointer shadow-md"
              >
                Simulei, Sincronizar!
              </button>
            </div>
          </div>
        </div>
      )}

      {notification && (
        <div className="fixed top-14 right-6 bg-slate-900 border-2 border-yellow-400 text-white p-4 rounded-xl z-50 shadow-2xl flex items-start gap-3.5 max-w-sm animate-bounce" id="alarm-ring-bell">
          <div className="p-2 bg-yellow-500 rounded-lg shrink-0 text-slate-900 animate-pulse">
            <BellRing className="w-5 h-5" />
          </div>
          <div>
            <h5 className="font-bold text-xs uppercase tracking-wide text-yellow-400 font-mono">Atendimento Ativo</h5>
            <p className="text-[11.5px] mt-1 text-slate-200 leading-normal font-medium">{notification}</p>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          apiConnected={stats.apiConnected}
        />

        <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
          
          {activeTab === "chats" && (
            <div className="flex-1 flex h-full overflow-hidden" id="tab-chats-pane">
              
              <div className="w-80 border-r border-slate-200 flex flex-col h-full bg-white shrink-0" id="inbox-list-column">
                <div className="p-4 border-b border-slate-100 shrink-0" id="inbox-header">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5 font-sans">
                      <MessageSquare className="w-4 h-4 text-yellow-500" />
                      Conversas Ativas
                    </h3>
                    <span className="text-[11px] bg-slate-100 text-slate-700 py-0.5 px-2 rounded-full font-bold font-mono">
                      {leads.length} Un
                    </span>
                  </div>
                  
                  <div className="mt-2 text-[10.5px] text-slate-450 font-semibold font-mono">
                    Unidade Fixa: Itabuna BA
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5" id="inbox-scroll-list">
                  {leads.length > 0 ? (
                    leads.map((ld) => (
                      <LeadCard
                        key={ld.id}
                        lead={ld}
                        isSelected={selectedLead?.id === ld.id}
                        onClick={() => setSelectedLead(ld)}
                      />
                    ))
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 border border-dashed border-slate-250 rounded-2xl">
                      <Smartphone className="w-8 h-8 text-slate-300 stroke-[1] mb-2" />
                      <p className="text-xs font-semibold text-slate-500">Sem leads ativos</p>
                      <p className="text-[10px] mt-1 text-slate-400 leading-relaxed">Use o simulador de celular à direita para gerar tráfego de teste instantâneo!</p>
                    </div>
                  )}
                </div>
              </div>

              <ChatWindow
                lead={selectedLead}
                messages={messages}
                onSendMessage={handleSendMessage}
                onToggleMode={handleToggleMode}
                activeStore={activeStore}
                activePresetId={flowConfig?.activeStoreId || "jal"}
                apiConnected={stats.apiConnected}
              />

            </div>
          )}

          {activeTab === "flow" && flowConfig && (
            <FlowEditor
              flowConfig={flowConfig}
              stores={stores}
              onSaveConfig={handleSaveConfig}
            />
          )}

          {activeTab === "stats" && (
            <StatsDashboard
              stats={stats}
              logs={webhookLogs}
              onClearLogs={handleClearLogs}
              onRefreshStats={isMockMode ? loadLocalInitialData : async () => {}}
            />
          )}

        </div>

        <div className="border-l border-slate-200 bg-slate-100 p-6 flex flex-col justify-center items-center shrink-0 hidden xl:flex shadow-inner select-none" id="phone-simulator-section">
          <SimulatorPhone
            currentLead={selectedLead}
            messages={messages}
            activeStore={activeStore}
            onIncomingSimulate={handleIncomingSimulate}
            onSimulateNewLead={handleSimulateNewLead}
            leadsList={leads}
            onSelectLead={(ld) => setSelectedLead(ld)}
          />
        </div>

      </div>
    </div>
  );
}
