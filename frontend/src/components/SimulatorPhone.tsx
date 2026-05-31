import React, { useState, useRef, useEffect } from "react";
import { Send, Smartphone, Plus, UserPlus, Phone, CheckCheck, Landmark, RefreshCw, X, MessageSquare, Sparkles } from "lucide-react";
import { Lead, Message, StorePreset } from "../types.ts";

interface SimulatorPhoneProps {
  currentLead: Lead | null;
  messages: Message[];
  activeStore: StorePreset;
  onIncomingSimulate: (phone: string, text: string, isButton?: boolean) => void;
  onSimulateNewLead: (name: string, phone: string, car: string, year: string, parts: string) => void;
  leadsList: Lead[];
  onSelectLead: (lead: Lead) => void;
}

export default function SimulatorPhone({
  currentLead,
  messages,
  activeStore,
  onIncomingSimulate,
  onSimulateNewLead,
  leadsList,
  onSelectLead
}: SimulatorPhoneProps) {
  const [inputText, setInputText] = useState("");
  const [showNewLeadModal, setShowNewLeadModal] = useState(false);
  const mobEndRef = useRef<HTMLDivElement>(null);

  // Form states for simulating new traffic
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newCar, setNewCar] = useState("");
  const [newYear, setNewYear] = useState("");
  const [newParts, setNewParts] = useState("");
  const [validationError, setValidationError] = useState("");

  useEffect(() => {
    mobEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentLead]);

  const handleSendFromPhone = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentLead || !inputText.trim()) return;
    onIncomingSimulate(currentLead.phone, inputText.trim(), false);
    setInputText("");
  };

  const handleButtonClick = (btnText: string) => {
    if (!currentLead) return;
    onIncomingSimulate(currentLead.phone, btnText, true);
  };

  const handleCreateSimulatedLeadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError("");

    if (!newPhone.trim()) {
      setValidationError("O número do WhatsApp é obrigatório.");
      return;
    }

    // Rough check
    const formatNumber = newPhone.replace(/[^0-9]/g, "");
    if (formatNumber.length < 8) {
      setValidationError("Informe um número de telefone simulado válido.");
      return;
    }

    onSimulateNewLead(
      newName.trim() || `Lead Simulado ${formatNumber.slice(-4)}`,
      `+55 (73) 9${formatNumber.slice(-4)}-${formatNumber.slice(-4)}`,
      newCar.trim() || "Toyota Hilux",
      newYear.trim() || "2020",
      newParts.trim() || "Discos e Pastilhas"
    );

    // Reset fields
    setNewName("");
    setNewPhone("");
    setNewCar("");
    setNewYear("");
    setNewParts("");
    setShowNewLeadModal(false);
  };

  return (
    <div className="w-96 flex flex-col items-center shrink-0" id="whatsapp-simulator-phone-wrapper">
      <div className="w-full bg-slate-900 rounded-3xl p-3 border-4 border-slate-950 shadow-2xl relative flex flex-col h-[750px] overflow-hidden" id="phone-container">
        
        {/* Device Notch & Status bar */}
        <div className="w-full h-6 px-6 flex justify-between items-center text-[11px] text-slate-400 font-mono font-bold select-none shrink-0" id="phone-notch-bar">
          <span>13:21</span>
          <div className="w-20 h-4 bg-slate-950 rounded-full flex items-center justify-center shrink-0">
            <div className="w-3 h-3 rounded-full bg-slate-800" />
          </div>
          <div className="flex gap-1 items-center">
            <span>5G</span>
            <div className="w-5 h-2.5 bg-emerald-500 rounded-sm" />
          </div>
        </div>

        {/* Simulator Selector Panel inside device header */}
        <div className="bg-slate-950 p-2.5 border-b border-slate-800 flex items-center justify-between gap-1.5 shrink-0" id="phone-interactivity-controls">
          <div className="flex-1">
            <label className="block text-[9px] uppercase font-bold text-slate-500 font-mono tracking-wider">
              Simular Aparelho de:
            </label>
            <select
              value={currentLead?.id || ""}
              onChange={(e) => {
                const found = leadsList.find(l => l.id === e.target.value);
                if (found) onSelectLead(found);
              }}
              className="w-full py-1 text-xs bg-slate-900 border border-slate-800 rounded px-1.5 text-slate-200 focus:outline-none font-sans"
            >
              <option value="" disabled>Seleccione um celular...</option>
              {leadsList.map(ld => (
                <option key={ld.id} value={ld.id}>
                  {ld.name} ({ld.phone.slice(-9)})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setShowNewLeadModal(true)}
            id="open-sim-lead-modal"
            className="p-2 bg-blue-600/20 text-blue-400 hover:bg-blue-600/35 border border-blue-500/15 rounded transition-all text-xs font-semibold shrink-0 cursor-pointer"
            title="Criar novo celular simulador"
          >
            <UserPlus className="w-4 h-4" />
          </button>
        </div>

        {/* WhatsApp App Mockup Container */}
        {currentLead ? (
          <div className="flex-1 bg-[#efeae2] relative flex flex-col overflow-hidden" id="phone-whatsapp-body">
            
            {/* WhatsApp Contact Header */}
            <div className="bg-[#008069] text-white p-3 flex items-center gap-2.5 shadow shrink-0" id="whatsapp-header">
              <div className="w-9 h-9 rounded-full bg-slate-150 text-slate-700 flex items-center justify-center font-bold font-mono">
                {currentLead.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-xs truncate leading-snug">{activeStore.name}</h4>
                <p className="text-[9.5px] text-emerald-100 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-450 animate-pulse" />
                  <span>Conta oficial • Atendimento</span>
                </p>
              </div>
              <div className="flex gap-2">
                <Phone className="w-3.5 h-3.5 text-emerald-100 opacity-90" />
              </div>
            </div>

            {/* Simulated WhatsApp Conversation Area */}
            <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 bg-opacity-70 bg-cover bg-center" style={{ backgroundImage: "url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')" }} id="whatsapp-messages-box">
              
              {/* Data Compliance warning bubble */}
              <div className="flex justify-center select-none">
                <span className="bg-yellow-100 border border-yellow-250 text-slate-600 text-[10px] px-2.5 py-1 rounded-lg text-center leading-normal max-w-[280px] shadow-sm">
                  🔒 Mensagens de segurança protegidas com canal sandbox anti-spam oficial em Itabuna BA.
                </span>
              </div>

              {messages.map((m) => {
                // Ignore operator internal alerts inside lead view
                if (m.role === "system_alert") return null;

                const isLeadOutgoing = m.role === "user";

                return (
                  <div
                    key={m.id}
                    id={`wa-phone-bubble-${m.id}`}
                    className={`flex ${isLeadOutgoing ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[260px] rounded-lg px-3 py-1.5 text-xs shadow-sm relative ${
                        isLeadOutgoing
                          ? "bg-[#d9fdd3] text-slate-800 rounded-tr-none"
                          : "bg-white text-slate-800 rounded-tl-none"
                      }`}
                    >
                      <p className="whitespace-pre-line text-[11.5px] leading-relaxed break-words">{m.text}</p>
                      
                      {/* Meta info footer inside bubble */}
                      <div className="text-[8.5px] text-slate-400 font-mono text-right mt-1 flex items-center justify-end gap-1 select-none">
                        <span>
                          {new Date(m.timestamp).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit"
                          })}
                        </span>
                        {isLeadOutgoing && (
                          <CheckCheck className="w-3 h-3 text-[#53bdeb]" />
                        )}
                      </div>

                      {/* Render Interactive Selectable buttons inside chat if bot is waiting opt-in */}
                      {!isLeadOutgoing && m.buttons && m?.buttons?.length > 0 && currentLead.currentStep === "opt_in" && (
                        <div className="mt-3 border-t border-slate-100 pt-2 flex flex-col gap-1.5" id={`wa-phone-clickable-buttons-${m.id}`}>
                          {m.buttons.map((btnOption, idx) => (
                            <button
                              key={idx}
                              onClick={() => handleButtonClick(btnOption)}
                              id={`wa-phone-click-btn-${idx}`}
                              className="w-full py-2 bg-slate-50 hover:bg-slate-100 border border-slate-150 text-[#008069] rounded font-semibold text-center text-[11px] transition-colors active:bg-slate-200 select-none cursor-pointer"
                            >
                              {btnOption}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={mobEndRef} />
            </div>

            {/* Simulated WhatsApp Keyboard input form */}
            <form onSubmit={handleSendFromPhone} className="bg-[#f0f2f5] p-2 flex items-center gap-1.5 border-t border-slate-200 shrink-0" id="whatsapp-input-bar">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Escreva como o cliente..."
                id="wa-phone-text-input"
                className="flex-1 bg-white border border-slate-150 rounded-full px-3.5 py-2 text-xs focus:outline-none text-slate-800"
              />
              <button
                type="submit"
                disabled={!inputText.trim()}
                id="wa-phone-send-btn"
                className="w-8.5 h-8.5 rounded-full bg-[#00a884] text-white flex items-center justify-center transition-opacity disabled:opacity-40 cursor-pointer text-xs"
              >
                <Send className="w-3.5 h-3.5 ml-0.5" />
              </button>
            </form>

          </div>
        ) : (
          <div className="flex-1 bg-slate-900 flex flex-col justify-center items-center text-center p-6 text-slate-400 select-none" id="phone-whatsapp-empty">
            <Smartphone className="w-12 h-12 stroke-[1] mb-2 opacity-30 text-blue-400 animate-pulse" />
            <p className="text-xs">Celular Desconectado</p>
            <p className="text-[10px] text-slate-500 mt-1">Crie um lead simulado usando o botão acima para iniciar seu teste.</p>
          </div>
        )}

      </div>

      <div className="mt-2.5 text-center px-4">
        <p className="text-[11px] text-slate-500 leading-snug font-sans">
          📱 <strong>Simulator Sandbox:</strong> Clique nos botões cinza de resposta interativa no telefone acima para testar o opt-in livre de banimentos.
        </p>
      </div>

      {/* Real simulated lead generator modal */}
      {showNewLeadModal && (
        <div className="fixed inset-0 bg-slate-950/70 z-50 flex items-center justify-center p-4 animate-fadeIn" id="new-lead-sim-modal">
          <div className="bg-slate-900 border border-slate-805 rounded-2xl max-w-sm w-full p-6 text-slate-100 flex flex-col gap-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <h4 className="font-bold text-sm text-white flex items-center gap-1.5">
                <UserPlus className="w-4 h-4 text-blue-450" />
                Criar Telefone Virtual
              </h4>
              <button
                onClick={() => setShowNewLeadModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {validationError && (
              <div className="p-3 bg-red-950/50 border border-red-800/80 rounded-lg text-red-400 text-xs font-medium">
                {validationError}
              </div>
            )}

            <form onSubmit={handleCreateSimulatedLeadSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] text-slate-400 uppercase tracking-wider font-semibold font-mono mb-1">
                  Nome do Cliente
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ex: Pedro Mecânico de Turbinas"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 uppercase tracking-wider font-semibold font-mono mb-1">
                  Número do WhatsApp (DDD + FONE)
                </label>
                <input
                  type="text"
                  required
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="Ex: 73999990000"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-slate-400 uppercase tracking-wider font-semibold font-mono mb-1">
                    Modelo do Veículo
                  </label>
                  <input
                    type="text"
                    value={newCar}
                    onChange={(e) => setNewCar(e.target.value)}
                    placeholder="Ex: Hilux 2.8 D"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 uppercase tracking-wider font-semibold font-mono mb-1">
                    Ano
                  </label>
                  <input
                    type="text"
                    value={newYear}
                    onChange={(e) => setNewYear(e.target.value)}
                    placeholder="Ex: 2018"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 uppercase tracking-wider font-semibold font-mono mb-1">
                  Peças Desejadas
                </label>
                <input
                  type="text"
                  value={newParts}
                  onChange={(e) => setNewParts(e.target.value)}
                  placeholder="Ex: Embreagem e Cabos"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <button
                type="submit"
                id="btn-confirm-simulated-lead-creation"
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer mt-4 shadow-md shadow-blue-900/40"
              >
                <Plus className="w-3.5 h-3.5" />
                Criar Celular de Testes
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
