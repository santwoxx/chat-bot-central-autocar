import React, { useState, useRef, useEffect } from "react";
import { Bot, User, Send, Smartphone, ShieldAlert, Cpu, AlertCircle, Sparkles, Building } from "lucide-react";
import { Lead, Message, StorePreset } from "../types.ts";

interface ChatWindowProps {
  lead: Lead | null;
  messages: Message[];
  onSendMessage: (text: string) => void;
  onToggleMode: () => void;
  activeStore: StorePreset;
  activePresetId: string;
  apiConnected: boolean;
}

export default function ChatWindow({
  lead,
  messages,
  onSendMessage,
  onToggleMode,
  activeStore,
  activePresetId,
  apiConnected
}: ChatWindowProps) {
  const [inputText, setInputText] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, lead]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText("");
  };

  if (!lead) {
    return (
      <div className="flex-1 bg-slate-50 flex flex-col items-center justify-center p-8 text-center" id="empty-chat-state">
        <div className="w-16 h-16 rounded-2xl bg-yellow-400/20 border border-yellow-200 flex items-center justify-center text-yellow-600 mb-4 animate-bounce">
          <Bot className="w-8 h-8" />
        </div>
        <h3 className="text-base font-semibold text-slate-800">Selecione uma Conversa</h3>
        <p className="text-sm text-slate-500 max-w-sm mt-1">
          Gerencie leads de autopeças de Itabuna. Você pode alternar manualmente ou deixar o piloto automático do motor de IA da Central Autocar fechar os orçamentos.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-slate-50 flex flex-col h-full border-r border-slate-200" id="chat-window-container">
      {/* Top Header Controls */}
      <div className="bg-white border-b border-slate-200 p-4 shrink-0 flex items-center justify-between" id="chat-header-bar">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold">
            {lead.name.charAt(0)}
          </div>
          <div>
            <h3 className="font-semibold text-slate-800 text-sm">{lead.name}</h3>
            <p className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
              <span>{lead.phone}</span>
              <span>•</span>
              <span className="text-emerald-600 font-bold uppercase text-[9px] tracking-wide bg-emerald-50 px-1 py-0.2 rounded">
                Canal Integrado Meta
              </span>
            </p>
          </div>
        </div>

        {/* Dynamic Mode Switch Controller */}
        <div className="flex items-center gap-2">
          <div className="bg-slate-100 p-1 rounded-xl flex items-center border border-slate-200">
            <button
              onClick={() => {
                if (lead.mode !== "AI") onToggleMode();
              }}
              id="set-mode-ai-btn"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase font-mono tracking-wider transition-all cursor-pointer ${
                lead.mode === "AI"
                  ? "bg-yellow-400 text-slate-950 shadow-md shadow-yellow-400/10"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              Bots Automatizados (IA)
            </button>
            <button
              onClick={() => {
                if (lead.mode !== "HUMAN") onToggleMode();
              }}
              id="set-mode-human-btn"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold uppercase font-mono tracking-wider transition-all ${
                lead.mode === "HUMAN"
                  ? "bg-orange-600 text-white shadow-md shadow-orange-900/10"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <User className="w-3.5 h-3.5" />
              Atendimento Manual
            </button>
          </div>
        </div>
      </div>

      {/* Vehicle Specification / Information banner for lightning support */}
      <div className="px-6 py-2.5 bg-white border-b border-slate-100 flex items-center gap-6 text-xs text-slate-600 shadow-sm shrink-0">
        <div>
          <span className="text-slate-400 font-mono font-bold">Veículo:</span>{" "}
          <span className="font-semibold text-slate-800">{lead.vehicleDetails?.car || "Não Registrado"} ({lead.vehicleDetails?.year || "N/A"})</span>
        </div>
        <div className="hidden sm:block">
          <span className="text-slate-400 font-mono font-bold">Peças de Interesse:</span>{" "}
          <span className="font-semibold text-slate-800 text-xs truncate max-w-[200px]">
            {lead.vehicleDetails?.partsInterested || "Não informado"}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1 text-[11px] bg-slate-100 px-2 py-0.5 rounded text-slate-500">
          <Building className="w-3 h-3 text-slate-400" />
          <span>Local: <strong>{activeStore.name}</strong></span>
        </div>
      </div>

      {/* Message Logger Container */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4" id="chat-messages-log">
        {messages.map((msg) => {
          if (msg.role === "system_alert") {
            return (
              <div key={msg.id} className="flex justify-center my-3" id={`alert-message-${msg.id}`}>
                <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-3.5 max-w-xl text-[11px] text-amber-800 shadow-sm flex items-start gap-2.5 leading-relaxed">
                  <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold font-mono block mb-0.5">TRANSICÂO DE ATENDIMENTO</span>
                    {msg.text}
                    {lead.mode === "HUMAN" && (
                      <span className="block mt-1 font-bold text-teal-700">
                        👉 Insira uma resposta manual abaixo para continuar com o cliente final na hora.
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          }

          const isUser = msg.role === "user";
          const isAgentHuman = msg.role === "agent_human";

          return (
            <div
              key={msg.id}
              className={`flex ${isUser ? "justify-start" : "justify-end"}`}
              id={`msg-bubble-${msg.id}`}
            >
              <div
                className={`max-w-lg rounded-2xl px-4 py-3 text-sm shadow-sm leading-relaxed ${
                  isUser
                    ? "bg-slate-200/90 text-slate-800 rounded-tl-none"
                    : isAgentHuman
                    ? "bg-slate-800 text-white rounded-tr-none"
                    : "bg-yellow-400 text-slate-950 rounded-tr-none font-medium"
                }`}
              >
                {/* Meta details header in chat bubbles */}
                <div className="flex items-center gap-1 text-[10px] mb-1 opacity-75 font-mono select-none">
                  {isUser ? (
                    <span className="font-semibold">Lead/Cliente</span>
                  ) : isAgentHuman ? (
                    <span className="font-bold flex items-center gap-0.5">
                      <User className="w-3 h-3" /> Vendedor Humano
                    </span>
                  ) : (
                    <span className="font-bold flex items-center gap-0.5">
                      <Sparkles className="w-3 h-3 animate-spin" /> Assistente Virtual IA
                    </span>
                  )}
                  <span>•</span>
                  <span>
                    {new Date(msg.timestamp).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
                  </span>
                </div>

                <p className="whitespace-pre-line text-[13px]">{msg.text}</p>

                {/* If interactive buttons are rendered natively in WhatsApp style */}
                {msg.buttons && msg.buttons.length > 0 && (
                  <div className="mt-2 text-blue-200 text-xs flex flex-wrap gap-1.5 select-none" id={`msg-buttons-container-${msg.id}`}>
                    <span className="w-full text-[10px] text-white/70 block font-mono">
                      Botões de Opt-in acoplados:
                    </span>
                    {msg.buttons.map((btnOpt, idx) => (
                      <span
                        key={idx}
                        className="bg-white/10 border border-white/20 text-white px-2 py-0.5 rounded text-[11px]"
                      >
                        {btnOpt}
                      </span>
                    ))}
                  </div>
                )}
                
                {msg.isButtonResponse && (
                  <span className="mt-1 block text-[10.5px] italic text-blue-300 font-mono">
                    ✓ Resposta enviada via Botão de Atendimento seguro
                  </span>
                )}
              </div>
            </div>
          );
        })}
        <div ref={chatEndRef} />
      </div>

      {/* Bottom Response Bar Input Area */}
      <div className="p-4 bg-white border-t border-slate-200 shrink-0" id="chat-input-toolbar">
        {/* Compliance Guard Advice */}
        {lead.mode === "AI" ? (
          <div className="mb-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5 flex items-center gap-2 text-[11px] text-slate-600 leading-snug">
            <Bot className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              A automação por IA está ativa para este lead. Se você enviar uma mensagem manual, o lead será <strong>automaticamente transferido</strong> para o modo Humano para evitar furos de comunicação.
            </span>
          </div>
        ) : (
          <div className="mb-2 bg-teal-50 border border-teal-100 rounded-lg px-3 py-1.5 flex items-center gap-2 text-[11px] text-slate-600 leading-snug">
            <AlertCircle className="w-4 h-4 text-teal-600 shrink-0" />
            <span>
              Atendimento Humano em curso. Mensagens automáticas desativadas temporariamente.
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={lead.currentStep === "opt_in"}
            id="operator-chat-input"
            placeholder={
              lead.currentStep === "opt_in"
                ? "Aguardando confirmação de botões pelo lead..."
                : lead.mode === "AI"
                ? "Escreva para responder manualmente (desliga o robô)..."
                : "Digite sua resposta para o cliente..."
            }
            className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:bg-white text-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || lead.currentStep === "opt_in"}
            id="operator-send-msg-btn"
            className="p-3 bg-yellow-400 hover:bg-yellow-500 text-slate-950 font-bold rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400 font-mono">
          <span>{apiConnected ? "⚡ Meta Cloud Webhook conectado" : "ℹ️ Utilizando simulador integrado offline"}</span>
          <span>Sessão: {lead.id.toUpperCase()}</span>
        </div>
      </div>
    </div>
  );
}
