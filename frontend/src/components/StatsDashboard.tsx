import React, { useState } from "react";
import { BarChart3, LineChart, Cpu, Coins, Clock, CheckCircle2, History, Trash2, ArrowRight, ArrowLeft, RefreshCw } from "lucide-react";
import { WebhookSimLog } from "../types.ts";

interface StatsDashboardProps {
  stats: {
    totalLeads: number;
    aiHandled: number;
    humanHandled: number;
    conversationsSaved: number;
    averageConfidence: number;
    savedTokens: number;
    responseTimeSavedSec: number;
    apiConnected: boolean;
  };
  logs: WebhookSimLog[];
  onClearLogs: () => void;
  onRefreshStats: () => void;
}

export default function StatsDashboard({ stats, logs, onClearLogs, onRefreshStats }: StatsDashboardProps) {
  const [activeLogTab, setActiveLogTab] = useState<"ALL" | "INBOUND" | "OUTBOUND">("ALL");

  const filteredLogs = logs.filter(l => {
    if (activeLogTab === "ALL") return true;
    return l.direction === activeLogTab;
  });

  // Calculations for illustrative impacts
  const waitTimeSavedMin = Math.round(stats.responseTimeSavedSec / 60);
  const costSavingsBRL = (stats.savedTokens * 0.000015 * 5.2).toFixed(2); // Mocked cost conversion in BRL (approx Gemini API 3.5 cost in reais)

  return (
    <div className="flex-1 bg-slate-50 overflow-y-auto p-8" id="stats-panel-container">
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-4 mb-8" id="stats-header">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 font-sans">Economia de Custo & Desempenho</h2>
          <p className="text-xs text-slate-500 mt-1">
            Métricas de tokens do OpenAI economizados e histórico de processamento do Webhook da Meta.
          </p>
        </div>

        <button
          onClick={onRefreshStats}
          id="refresh-stats-btn"
          className="px-3.5 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Sincronizar Métricas</span>
        </button>
      </div>

      {/* Grid of Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8" id="metrics-grid">
        
        {/* Token Savings Card */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6" id="metric-tokens-card">
          <div className="flex justify-between items-start">
            <div className="p-3 bg-yellow-50 border border-yellow-100 rounded-xl text-yellow-600">
              <Coins className="w-5 h-5" />
            </div>
            <span className="text-emerald-500 font-bold font-mono text-[11px] bg-emerald-50 px-2 py-0.5 rounded-full">
              ~ R${costSavingsBRL} Salvo
            </span>
          </div>
          <div className="mt-4">
            <p className="text-xs text-slate-500 font-mono uppercase tracking-wider font-semibold">Tokens Economizados</p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1 font-mono">
              {stats.savedTokens.toLocaleString()}
            </h3>
            <p className="text-[11px] text-slate-400 mt-1.5 leading-snug">
              Economia realizada ao repassar imediato a humanos assim que o interesse comercial é flagrado.
            </p>
          </div>
        </div>

        {/* Wait Time Saved Card */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6" id="metric-waiting-saved-card">
          <div className="flex justify-between items-start">
            <div className="p-3 bg-teal-50 border border-teal-100 rounded-xl text-teal-600">
              <Clock className="w-5 h-5" />
            </div>
            <span className="text-teal-600 font-bold font-mono text-[11px] bg-teal-50 px-2 py-0.5 rounded-full">
              96% Mais Rápido
            </span>
          </div>
          <div className="mt-4">
            <p className="text-xs text-slate-500 font-mono uppercase tracking-wider font-semibold">Tempo de Espera Reduzido</p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1 font-mono">
              ~ {waitTimeSavedMin} minutos
            </h3>
            <p className="text-[11px] text-slate-400 mt-1.5 leading-snug">
              Minutos evitados em filas de frotistas através da agilidade do disparo imediato por botões.
            </p>
          </div>
        </div>

        {/* Lead Conversion Card */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6" id="metric-conversations-card">
          <div className="flex justify-between items-start">
            <div className="p-3 bg-purple-50 border border-purple-100 rounded-xl text-purple-600">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <span className="text-purple-600 font-bold font-mono text-[11px] bg-purple-50 px-2 py-0.5 rounded-full">
              {Math.round((stats.aiHandled / stats.totalLeads) * 100) || 50}% Auto-OptIn
            </span>
          </div>
          <div className="mt-4">
            <p className="text-xs text-slate-500 font-mono uppercase tracking-wider font-semibold font-mono">Simulações de Conversa</p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1 font-mono">
              {stats.totalLeads} Conversas
            </h3>
            <p className="text-[11px] text-slate-400 mt-1.5 leading-snug">
              Total de fones de Itabuna BA que interagiram e aceitaram os botões de segurança.
            </p>
          </div>
        </div>

        {/* Quality level */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6" id="metric-quality-card">
          <div className="flex justify-between items-start">
            <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-amber-600">
              <Cpu className="w-5 h-5" />
            </div>
            <span className="text-amber-600 font-bold font-mono text-[11px] bg-amber-50 px-2 py-0.5 rounded-full">
              Alta Precisão
            </span>
          </div>
          <div className="mt-4">
            <p className="text-xs text-slate-500 font-mono uppercase tracking-wider font-semibold font-mono">Adesão Escala de IA</p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1 font-mono">
              {stats.averageConfidence}% Confiança
            </h3>
            <p className="text-[11px] text-slate-400 mt-1.5 leading-snug">
              Taxa de acertos em que a IA respondeu sem requisições manuais ou ruídos de spams.
            </p>
          </div>
        </div>

      </div>

      {/* Meta Webhook Telemetry Monitor (Bento-box Style) */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6" id="meta-logs-telemetry-panel">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <History className="text-yellow-500 w-5 h-5" />
            <div>
              <h3 className="font-semibold text-slate-800 text-sm">Monitor de Transações Webhook Meta</h3>
              <p className="text-xs text-slate-500 mt-0.5">Visão transparente e sem ruído dos pacotes JSON recebidos do WhatsApp Business API.</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="bg-slate-100 p-1 rounded-xl flex items-center border border-slate-200 text-xs text-slate-600 font-semibold font-mono">
              <button
                onClick={() => setActiveLogTab("ALL")}
                className={`px-2.5 py-1 rounded-lg ${activeLogTab === "ALL" ? "bg-white text-slate-900 shadow-sm" : ""}`}
              >
                Tudo
              </button>
              <button
                onClick={() => setActiveLogTab("INBOUND")}
                className={`px-2.5 py-1 rounded-lg ${activeLogTab === "INBOUND" ? "bg-white text-slate-900 shadow-sm" : ""}`}
              >
                Inbound
              </button>
              <button
                onClick={() => setActiveLogTab("OUTBOUND")}
                className={`px-2.5 py-1 rounded-lg ${activeLogTab === "OUTBOUND" ? "bg-white text-slate-900 shadow-sm" : ""}`}
              >
                Outbound
              </button>
            </div>

            <button
              onClick={onClearLogs}
              id="clear-logs-btn"
              className="p-2 border border-slate-250 text-slate-600 hover:text-red-500 hover:border-red-200 rounded-lg transition-colors cursor-pointer"
              title="Limpar de Logs"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="text-center py-10 text-slate-400" id="empty-logs-state">
            <History className="w-10 h-10 mx-auto opacity-30 stroke-[1.5] mb-2 text-yellow-550" />
            <p className="text-xs">Nenhum pacote webhook trafegado nesta sessão ainda.</p>
            <p className="text-[11px] text-slate-550 mt-1">Interaja com os clientes no simulador celular à direita para gerar telemetria.</p>
          </div>
        ) : (
          <div className="space-y-3.5 max-h-[400px] overflow-y-auto pr-2" id="logs-feed">
            {filteredLogs.map((log) => {
              const isEventIn = log.direction === "INBOUND";
              return (
                <div
                  key={log.id}
                  id={`log-item-${log.id}`}
                  className={`p-3.5 rounded-xl border font-mono text-[11px] leading-relaxed transition-all ${
                    isEventIn
                      ? "bg-emerald-50/50 border-emerald-150/60"
                      : "bg-amber-50/50 border-amber-150/60"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded font-bold text-[9px] text-white tracking-widest ${
                        isEventIn ? "bg-emerald-600" : "bg-amber-500"
                      }`}>
                        {isEventIn ? (
                          <span className="flex items-center gap-0.5">
                            <ArrowLeft className="w-3 h-3" /> INBOUND (META)
                          </span>
                        ) : (
                          <span className="flex items-center gap-0.5">
                            <ArrowRight className="w-3 h-3" /> OUTBOUND (API)
                          </span>
                        )}
                      </span>

                      <span className="text-slate-400">•</span>
                      
                      <span className="text-slate-705 uppercase font-bold bg-slate-200/50 px-1 rounded-sm text-[8px]">
                        TIPO: {log.type}
                      </span>
                    </div>

                    <span className="text-[10px] text-slate-400 font-mono">
                      {new Date(log.timestamp).toLocaleTimeString("pt-BR", { hour12: false })}{"."}{new Date(log.timestamp).getMilliseconds()}
                    </span>
                  </div>

                  <p className="text-slate-700 bg-white/70 p-2 border border-slate-100 rounded-lg overflow-x-auto whitespace-pre-wrap font-mono select-all">
                    {JSON.stringify(JSON.parse(log.payload), null, 2)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
