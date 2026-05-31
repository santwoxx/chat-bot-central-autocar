import React, { useState, useEffect } from "react";
import { 
  Settings, Save, AlertCircle, Sparkles, MessageSquare, Plus, X, 
  Bot, ArrowRight, UserCheck, ShieldAlert, Zap, Network, Shuffle, Smartphone 
} from "lucide-react";
import { FlowConfig, StorePreset, WhatsAppConfig } from "../types.ts";

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

  // Requisito 3, 4 & 5: WhatsApp Config state
  const [whatsappConfig, setWhatsappConfig] = useState<WhatsAppConfig>({
    provider: "AUTO",
    phoneNumberId: "",
    accessToken: "",
    verifyToken: "opt_in_prevent_ban",
    useOpenAi: false,
    openAiKey: "",
    evolutionApiUrl: "",
    evolutionApiKey: "",
    evolutionInstanceName: ""
  });

  const [healthStatus, setHealthStatus] = useState<any>(null);

  // Dynamic config loading from server
  useEffect(() => {
    fetch("/api/whatsapp-config")
      .then(res => res.json())
      .then(data => {
        if (data) {
          setWhatsappConfig({
            provider: data.provider || "AUTO",
            phoneNumberId: data.phoneNumberId || "",
            accessToken: data.accessToken || "",
            verifyToken: data.verifyToken || "opt_in_prevent_ban",
            useOpenAi: !!data.useOpenAi,
            openAiKey: data.openAiKey || "",
            evolutionApiUrl: data.evolutionApiUrl || "",
            evolutionApiKey: data.evolutionApiKey || "",
            evolutionInstanceName: data.evolutionInstanceName || ""
          });
        }
      })
      .catch(err => console.error("Erro ao ler whatsapp config:", err));

    // Requisito 11: Real-time health loader
    fetch("/api/health")
      .then(res => res.json())
      .then(data => setHealthStatus(data))
      .catch(() => {});
  }, []);

  const handleSave = () => {
    // 1. Salva fluxo principal do assistente
    onSaveConfig({
      activeStoreId,
      optInText,
      optInButtons,
      aiGreeting,
      aiSystemPrompt,
      escalationKeywords
    });

    // 2. Salva credenciais dos canais de WhatsApp
    fetch("/api/whatsapp-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(whatsappConfig)
    })
      .then(res => res.json())
      .then(() => {
        setSaveSuccess(true);
        // Refresh health status
        fetch("/api/health")
          .then(res => res.json())
          .then(data => setHealthStatus(data))
          .catch(() => {});

        setTimeout(() => setSaveSuccess(false), 3000);
      })
      .catch(err => console.error("Erro ao salvar config:", err));
  };

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
    <div className="flex-1 bg-slate-55 overflow-y-auto p-8" id="flow-configurator-container">
      {/* Upper Navigation Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8" id="flow-header">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Configuração de Fluxo & Canais</h2>
          <p className="text-xs text-slate-500 mt-1">
            Defina o comportamento do robô e gerencie as integrações de WhatsApp (Meta e Evolution API).
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
          <Zap className="w-4 h-4 text-emerald-600 animate-bounce" />
          <span>Configurações e canais persistidos e sincronizados com sucesso no banco de dados!</span>
        </div>
      )}

      {/* Real-time Health Checks Banner */}
      {healthStatus && (
        <div className="mb-6 p-4 bg-white border border-slate-200 rounded-2xl shadow-sm grid grid-cols-2 md:grid-cols-4 gap-4" id="realtime-health-panel">
          <div className="flex flex-col">
            <span className="text-[10px] font-mono uppercase text-slate-400 font-bold">Firestore DB</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`w-2 h-2 rounded-full ${healthStatus.firestore?.status === "online" ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
              <span className="text-xs font-bold text-slate-700 capitalize">{healthStatus.firestore?.status}</span>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-mono uppercase text-slate-400 font-bold">Google Gemini AI</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`w-2 h-2 rounded-full ${healthStatus.gemini?.status === "online" ? "bg-emerald-500" : "bg-rose-500"}`} />
              <span className="text-xs font-bold text-slate-700 capitalize">{healthStatus.gemini?.status}</span>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-mono uppercase text-slate-400 font-bold">Evolution API</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`w-2 h-2 rounded-full ${healthStatus.evolution?.status === "online" ? "bg-emerald-500" : healthStatus.evolution?.status === "degraded" ? "bg-amber-500" : "bg-rose-400"}`} />
              <span className="text-xs font-bold text-slate-700 capitalize">{healthStatus.evolution?.status || "Inativa"}</span>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-mono uppercase text-slate-400 font-bold">Meta Cloud API</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`w-2 h-2 rounded-full ${healthStatus.meta?.status === "online" ? "bg-emerald-500" : "bg-rose-500"}`} />
              <span className="text-xs font-bold text-slate-700 capitalize">{healthStatus.meta?.status || "Inativo"}</span>
            </div>
          </div>
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
        <div className="relative border-l-2 border-dashed border-slate-200 pl-8 pb-4" id="node-opt-in-container">
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
        <div className="relative border-l-2 border-dashed border-slate-200 pl-8 pb-4" id="node-ai-instruct-container">
          <div className="absolute -left-3 top-0 w-6 h-6 rounded-full bg-yellow-440 text-slate-900 flex items-center justify-center text-xs font-bold shadow font-mono">
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
                Inteligência Central Autocar (Gemini + Fallback OpenAI)
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
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-770 min-h-[160px] focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:bg-white leading-relaxed font-mono"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Node 3: Rules of Escalation */}
        <div className="relative border-l-2 border-dashed border-slate-200 pl-8 pb-4" id="node-escalation-container">
          <div className="absolute -left-3 top-0 w-6 h-6 rounded-full bg-teal-500 text-white flex items-center justify-center text-xs font-bold shadow font-mono">
            3
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 max-w-4xl" id="node-escalation-card">
            <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-slate-100">
              <UserCheck className="w-4.5 h-4.5 text-teal-600" />
              <h4 className="font-semibold text-slate-800 text-sm">Gatilhos de Escalação Física de Vendedores</h4>
            </div>

            <div className="bg-slate-50 p-4 border border-slate-150 rounded-xl mb-4 text-xs text-slate-600 leading-relaxed flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
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

        {/* Node 4: Dynamic Credentials Panel (Requisito 3, 4, 5, & 6: Meta + Evolution dual channel failover settings) */}
        <div className="relative pl-8" id="node-credentials-container">
          <div className="absolute -left-3 top-0 w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold shadow font-mono">
            4
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 max-w-4xl" id="node-credentials-card">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-6">
              <div className="flex items-center gap-2.5">
                <Network className="w-4.5 h-4.5 text-blue-500" />
                <h4 className="font-semibold text-navigate text-sm">Canais de Integração & Contingência Ativa</h4>
              </div>
              <div className="text-[10px] bg-blue-50 border border-blue-150 rounded px-2.5 py-1 font-mono font-bold text-blue-700">
                Failover Integrado
              </div>
            </div>

            {/* Selector Buttons (Requisito 5 & 6) */}
            <div className="mb-8">
              <label className="block text-xs font-semibold text-slate-600 mb-2.5 font-mono uppercase">
                Provedor de Disparo do Sistema (Gateway Ativo)
              </label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setWhatsappConfig({ ...whatsappConfig, provider: "AUTO" })}
                  className={`p-3.5 border rounded-xl text-left transition-all flex flex-col justify-between cursor-pointer ${whatsappConfig.provider === "AUTO" ? "bg-blue-50/70 border-blue-400 ring-2 ring-blue-100" : "bg-slate-50 border-slate-200 hover:bg-slate-100"}`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xs font-bold text-slate-800">1. FAILOVER AUTO</span>
                    <Shuffle className={`w-4 h-4 ${whatsappConfig.provider === "AUTO" ? "text-blue-500 animate-spin" : "text-slate-400"}`} />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
                    Prioriza a <strong>Evolution API</strong>. Se instável, muda instantaneamente para <strong>Meta Cloud</strong>.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setWhatsappConfig({ ...whatsappConfig, provider: "EVOLUTION" })}
                  className={`p-3.5 border rounded-xl text-left transition-all flex flex-col justify-between cursor-pointer ${whatsappConfig.provider === "EVOLUTION" ? "bg-amber-50/70 border-amber-400 ring-2 ring-amber-100" : "bg-slate-50 border-slate-200 hover:bg-slate-100"}`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xs font-bold text-slate-800">2. APENAS EVOLUTION</span>
                    <Smartphone className="w-4 h-4 text-slate-500" />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
                    Dispara unicamente pela <strong>Evolution API</strong> utilizando conexão instantânea por QR Code (Baileys).
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setWhatsappConfig({ ...whatsappConfig, provider: "META" })}
                  className={`p-3.5 border rounded-xl text-left transition-all flex flex-col justify-between cursor-pointer ${whatsappConfig.provider === "META" ? "bg-teal-50/70 border-teal-400 ring-2 ring-teal-100" : "bg-slate-50 border-slate-200 hover:bg-slate-100"}`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xs font-bold text-slate-800">3. APENAS META CLOUD</span>
                    <Settings className="w-4 h-4 text-slate-500" />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
                    Dispara unicamente pela infraestrutura formal e homologada do <strong>Meta WhatsApp Cloud API</strong>.
                  </p>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Section A: Evolution API Gate details */}
              <div className="p-5 bg-slate-50/50 border border-slate-200 rounded-2xl flex flex-col gap-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                  <Smartphone className="w-4 h-4 text-amber-500" />
                  <span className="text-xs font-bold text-slate-800">Credenciais Evolution API (Canal Principal)</span>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase font-mono">
                    URL da API Evolution
                  </label>
                  <input
                    type="text"
                    value={whatsappConfig.evolutionApiUrl}
                    onChange={(e) => setWhatsappConfig({ ...whatsappConfig, evolutionApiUrl: e.target.value })}
                    placeholder="https://api.evolution.suaempresa.com"
                    className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase font-mono">
                    Chave apikey Global
                  </label>
                  <input
                    type="password"
                    value={whatsappConfig.evolutionApiKey}
                    onChange={(e) => setWhatsappConfig({ ...whatsappConfig, evolutionApiKey: e.target.value })}
                    placeholder="SuaApiKeyDoPainelEvolution"
                    className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase font-mono">
                    Nome da Instância
                  </label>
                  <input
                    type="text"
                    value={whatsappConfig.evolutionInstanceName}
                    onChange={(e) => setWhatsappConfig({ ...whatsappConfig, evolutionInstanceName: e.target.value })}
                    placeholder="CentralAutocar"
                    className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 font-mono"
                  />
                </div>
              </div>

              {/* Section B: Meta details */}
              <div className="p-5 bg-slate-50/50 border border-slate-200 rounded-2xl flex flex-col gap-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                  <Settings className="w-4 h-4 text-teal-600" />
                  <span className="text-xs font-bold text-slate-800">Credenciais Meta WhatsApp (Contingência)</span>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase font-mono">
                    ID do Número (Phone Number ID)
                  </label>
                  <input
                    type="text"
                    value={whatsappConfig.phoneNumberId}
                    onChange={(e) => setWhatsappConfig({ ...whatsappConfig, phoneNumberId: e.target.value })}
                    placeholder="109212001928372"
                    className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase font-mono">
                    Token de Acesso Comercial
                  </label>
                  <input
                    type="password"
                    value={whatsappConfig.accessToken}
                    onChange={(e) => setWhatsappConfig({ ...whatsappConfig, accessToken: e.target.value })}
                    placeholder="EAAGz2F9..."
                    className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase font-mono">
                    Verify Token do Webhook
                  </label>
                  <input
                    type="text"
                    value={whatsappConfig.verifyToken}
                    onChange={(e) => setWhatsappConfig({ ...whatsappConfig, verifyToken: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 font-mono"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
