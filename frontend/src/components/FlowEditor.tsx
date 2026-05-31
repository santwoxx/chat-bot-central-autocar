import React, { useState } from "react";
import { Settings, Save, AlertCircle, Sparkles, MessageSquare, Plus, X, Bot, ArrowRight, UserCheck, ShieldAlert, Zap } from "lucide-react";
import { FlowConfig, StorePreset } from "../types.ts";

interface FlowEditorProps {
  flowConfig: FlowConfig;
  stores: StorePreset[];
  onSaveConfig: (newConfig: FlowConfig) => void;
}

export default function FlowEditor({ flowConfig, stores, onSaveConfig }: FlowEditorProps) {
  const [optInText, setOptInText] = useState(flowConfig.optInText);
  const [optInButtons, setOptInButtons] = useState<string[]>(flowConfig.optInButtons);
  const [newButtonText, setNewButtonText] = useState("");
  const [aiGreeting, setAiGreeting] = useState(flowConfig.aiGreeting);
  const [aiSystemPrompt, setAiSystemPrompt] = useState(flowConfig.aiSystemPrompt);
  const [escalationKeywords, setEscalationKeywords] = useState<string[]>(flowConfig.escalationKeywords);
  const [newKeyword, setNewKeyword] = useState("");
  const [activeStoreId, setActiveStoreId] = useState(flowConfig.activeStoreId);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSave = () => {
    onSaveConfig({
      activeStoreId,
      optInText,
      optInButtons,
      aiGreeting,
      aiSystemPrompt,
      escalationKeywords
    });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  // Preset prompts tailored for regional automotive markets
  const CHARACTER_PRESETS = [
    {
      id: "tecnico",
      name: "Consultor Técnico Consultivo",
      description: "Foco profundo em especificações originais, mecânica leve, suspensão e freios.",
      systemPrompt: "Você é o especialista de balcão de vendas inteligente de autopeças de Itabuna BA.\n\nEspecialmente paciente para explicar diferenças de marcas de amortecedores (Cofap x Monroe) e indicar as de freio corretas (Cobreq x Bosch) para evitar devoluções de mecânicos da área.\n\nRegras de ouro:\n- Não finja preços exatos se não o tiver cadastrado, ofereça cotação formal.\n- Seja encorajador e educado.\n- Quando o cliente decidir comprar, use termos que acionem a escala humana."
    },
    {
      id: "vendedor",
      name: "Vendedor de Balcão Ágil",
      description: "Foco em negociação veloz, descontos rápidos, atacado e senso de urgência.",
      systemPrompt: "Você é um vendedor de autopeças dinâmico, rápido de balcão focado nas demandas de autopeças em Itabuna BA.\n\nSua fala é curta, focada em resolver o problema do mecânico com jargões tradicionais da oficina. Use termos técnicos diretos, ofereça opções similiares e de marcas renomadas.\n\nSempre pergunte se deseja fechar ou retirar na hora. Se demonstrar que sim, transfira para fechamento humano."
    },
    {
      id: "importado",
      name: "Especialista em Vans, Pickups & Importados",
      description: "Foco em peças raras, componentes hidráulicos e turbinas.",
      systemPrompt: "Você é o consultor master em utilitários, pickups e veículos importados.\n\nDomina marcas de embreagens LUK, peças pesadas Mercedes Sprinter, Fiat Toro, Hilux e frotas.\n\nUse postura profissional de especialista em fretes e frotas comerciais. Exalte a garantia imediata e procedência original das autopeças."
    }
  ];

  const applyPreset = (presetSystemPrompt: string) => {
    setAiSystemPrompt(presetSystemPrompt);
  };

  // Opt-in interactive button removal
  const handleRemoveButton = (indexToRemove: number) => {
    setOptInButtons(optInButtons.filter((_, idx) => idx !== indexToRemove));
  };

  const handleAddButton = () => {
    const trimmed = newButtonText.trim();
    if (trimmed && optInButtons.length < 3) {
      setOptInButtons([...optInButtons, trimmed]);
      setNewButtonText("");
    }
  };

  // Escalation keywords modification
  const handleAddKeyword = () => {
    const trimmed = newKeyword.trim().toLowerCase();
    if (trimmed && !escalationKeywords.includes(trimmed)) {
      setEscalationKeywords([...escalationKeywords, trimmed]);
      setNewKeyword("");
    }
  };

  const handleRemoveKeyword = (keywordToRemove: string) => {
    setEscalationKeywords(escalationKeywords.filter(k => k !== keywordToRemove));
  };

  return (
    <div className="flex-1 bg-slate-50 overflow-y-auto p-8" id="flow-configurator-container">
      {/* Upper Navigation Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8" id="flow-header">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Visual Flow & Skills Builder</h2>
          <p className="text-xs text-slate-500 mt-1">
            Configure seu assistente ManyChat e os canais anti-banimento do WhatsApp Business API.
          </p>
        </div>

        <button
          onClick={handleSave}
          id="save-flow-config-btn"
          className="px-4 py-2.5 bg-yellow-400 hover:bg-yellow-500 text-slate-950 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-md shadow-yellow-400/10"
        >
          <Save className="w-4 h-4" />
          <span>Salvar Alterações</span>
        </button>
      </div>

      {saveSuccess && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2.5 animate-fadeIn" id="save-success-banner">
          <Zap className="w-4 h-4 text-emerald-600" />
          <span>Fluxo configurado e sincronizado com os servidores do WhatsApp simulado com sucesso!</span>
        </div>
      )}

      {/* Database Context Selector */}
      <div className="mb-8 p-5 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6" id="context-database-card">
        <div className="max-w-xl">
          <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-500" />
            1. Estabelecer Contexto de Atendimento do Balcão
          </h3>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Selecione qual loja de Autopeças física de Itabuna BA o robô representará. Isso fará com que as respostas incorporem automaticamente o endereço, telefone e diferenciais da filial sem precisar reescrever o prompt!
          </p>
        </div>

        <select
          value={activeStoreId}
          onChange={(e) => setActiveStoreId(e.target.value)}
          id="store-preset-select"
          className="border border-slate-200 rounded-xl px-4 py-2.5 text-xs bg-slate-50 focus:bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-yellow-400"
        >
          {stores.map(st => (
            <option key={st.id} value={st.id}>
              {st.name} ({st.specialties[0]})
            </option>
          ))}
        </select>
      </div>

      {/* Visual Workspace Row */}
      <div className="space-y-8" id="flow-node-workspace">
        
        {/* Node 1: Defensive Opt-In Step */}
        <div className="relative border-l-2 border-dashed border-yellow-200 pl-8 pb-4" id="node-opt-in-container">
          <div className="absolute -left-3 top-0 w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-bold shadow font-mono">
            1
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 max-w-4xl" id="node-opt-in-card">
            <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-slate-100">
              <ShieldAlert className="w-4.5 h-4.5 text-emerald-500" />
              <h4 className="font-semibold text-slate-800 text-sm">Passo Anti-Banimento: Opt-In com Botões Interativos (Central Autocar)</h4>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5 font-mono uppercase">
                  Mensagem Protetora de Entrada
                </label>
                <textarea
                  value={optInText}
                  onChange={(e) => setOptInText(e.target.value)}
                  id="opt-in-message-input"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-700 min-h-[90px] focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:bg-white leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5 font-mono uppercase">
                  Botões de Resposta WhatsApp (Máx 3)
                </label>
                
                <div className="flex items-center gap-2 mb-3">
                  <input
                    type="text"
                    value={newButtonText}
                    onChange={(e) => setNewButtonText(e.target.value)}
                    disabled={optInButtons.length >= 3}
                    id="new-opt-in-btn-input"
                    placeholder={optInButtons.length >= 3 ? "Limite de 3 botões atingido" : "Adicionar botão (ex: 🔍 Ver Catálogo)"}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:bg-white text-slate-800 disabled:opacity-50"
                  />
                  <button
                    onClick={handleAddButton}
                    disabled={optInButtons.length >= 3}
                    id="add-opt-in-btn"
                    className="p-2 bg-yellow-50 hover:bg-yellow-105 border border-yellow-200 text-amber-600 rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex flex-wrap gap-2" id="opt-in-buttons-pills">
                  {optInButtons.map((btn, index) => (
                    <span
                      key={index}
                      className="px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 flex items-center gap-1.5"
                    >
                      <span>{btn}</span>
                      <button
                        onClick={() => handleRemoveButton(index)}
                        className="text-slate-400 hover:text-red-500"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Node 2: Automated Chatting & Gemini Instruct */}
        <div className="relative border-l-2 border-dashed border-yellow-250 pl-8 pb-4" id="node-ai-instruct-container">
          <div className="absolute -left-3 top-0 w-6 h-6 rounded-full bg-yellow-400 text-slate-950 flex items-center justify-center text-xs font-bold shadow font-mono">
            2
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 max-w-4xl" id="node-ai-instruct-card">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <Bot className="w-4.5 h-4.5 text-yellow-500" />
                <h4 className="font-semibold text-slate-800 text-sm">Persona e Instruções de Inteligência do Robô (Central Autocar)</h4>
              </div>
              
              <div className="flex items-center gap-1.5 bg-yellow-50 px-2.5 py-1 rounded-md text-[10px] text-amber-800 font-semibold font-mono border border-yellow-200">
                <Sparkles className="w-3 h-3 animate-pulse text-yellow-500" />
                Inteligência Central Autocar
              </div>
            </div>

            {/* Presets Grid */}
            <div className="mb-5">
              <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold font-mono mb-2">
                Importar Receitas de Vendas (Cenários Locais)
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {CHARACTER_PRESETS.map(preset => (
                  <button
                    key={preset.id}
                    onClick={() => applyPreset(preset.systemPrompt)}
                    className="p-3 bg-slate-50 hover:bg-yellow-50/50 hover:border-yellow-250 border border-slate-100 rounded-xl text-left transition-all group cursor-pointer"
                  >
                    <h5 className="font-bold text-slate-800 text-xs group-hover:text-amber-600">
                      {preset.name}
                    </h5>
                    <p className="text-[10px] text-slate-500 mt-1 leading-snug">
                      {preset.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5 font-mono uppercase">
                  Mensagem de Boas-Vindas Pós-Opt-In
                </label>
                <input
                  type="text"
                  value={aiGreeting}
                  onChange={(e) => setAiGreeting(e.target.value)}
                  id="ai-greeting-input"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5 font-mono uppercase">
                  Instruções de Comunicação (System Prompt)
                </label>
                <textarea
                  value={aiSystemPrompt}
                  onChange={(e) => setAiSystemPrompt(e.target.value)}
                  id="ai-system-prompt-input"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-700 min-h-[160px] focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:bg-white leading-relaxed font-mono"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Node 3: Rules of Escalation */}
        <div className="relative pl-8" id="node-escalation-container">
          <div className="absolute -left-3 top-0 w-6 h-6 rounded-full bg-teal-500 text-white flex items-center justify-center text-xs font-bold shadow font-mono">
            3
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 max-w-4xl" id="node-escalation-card">
            <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-slate-100">
              <UserCheck className="w-4.5 h-4.5 text-teal-600" />
              <h4 className="font-semibold text-slate-800 text-sm">Gatilhos de Escalação Física de Vendedores</h4>
            </div>

            <div className="bg-slate-50 p-4 border border-slate-150 rounded-xl mb-4 text-xs text-slate-600 leading-relaxed flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-550 shrink-0 mt-0.5" />
              <p>
                Quando o robô detecta termos de decisão comercial, a conversa é repassada <strong>imediatamente para o atendimento de seus vendedores humanos</strong>. Esse mecanismo economiza tokens e remove a latência para os clientes finalizarem fechamentos na hora!
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 font-mono uppercase">
                Gatilhos Comerciais Configurados
              </label>

              <div className="flex items-center gap-2 mb-3">
                <input
                  type="text"
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddKeyword();
                    }
                  }}
                  id="new-keyword-input"
                  placeholder="Ex: pix, comprar, desconto, atendente"
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:bg-white text-slate-800"
                />
                <button
                  onClick={handleAddKeyword}
                  id="add-keyword-btn"
                  className="p-2 bg-teal-50 hover:bg-teal-100 border border-teal-150 text-teal-600 rounded-xl transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5" id="escalation-keywords-pills">
                {escalationKeywords.map((keyword) => (
                  <span
                    key={keyword}
                    className="px-2.5 py-1 bg-teal-50 border border-teal-150 rounded-md text-[11px] font-semibold text-teal-700 flex items-center gap-1.5 uppercase font-mono"
                  >
                    <span>{keyword}</span>
                    <button
                      onClick={() => handleRemoveKeyword(keyword)}
                      className="text-teal-400 hover:text-red-500"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
