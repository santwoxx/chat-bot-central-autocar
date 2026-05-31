import React from "react";
import { MessageSquare, Settings2, BarChart3, HelpCircle, Bot, ShieldAlert, Cpu } from "lucide-react";

interface SidebarProps {
  activeTab: "chats" | "flow" | "stats";
  setActiveTab: (tab: "chats" | "flow" | "stats") => void;
  apiConnected: boolean;
}

export default function Sidebar({ activeTab, setActiveTab, apiConnected }: SidebarProps) {
  return (
    <div className="w-80 bg-slate-950 text-slate-200 flex flex-col border-r border-slate-900" id="sidebar-container">
      {/* Brand Header */}
      <div className="p-6 border-b border-slate-900 flex flex-col gap-2.5" id="sidebar-header">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-yellow-400 to-amber-500 text-slate-955 font-black rounded-xl leading-none select-none tracking-wider shadow-md shadow-yellow-500/10 text-xs">
            CA
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white leading-tight">Central Autocar</h1>
            <p className="text-[10px] text-slate-500 font-mono mt-0.5">Software de Operações</p>
          </div>
        </div>
        
        {/* Compliance Guard Badging */}
        <div className="mt-2 flex items-center gap-2 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-[10.5px] text-emerald-400 font-medium">
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
          </span>
          <span>Filtro Anti-Spam Ativo</span>
        </div>
      </div>

      {/* Navigation Sections */}
      <div className="flex-1 px-3.5 py-6 flex flex-col gap-1.5" id="sidebar-nav">
        <p className="text-[9.5px] uppercase tracking-widest font-bold text-slate-600 px-3.5 mb-2 font-mono">
          Gerenciamento
        </p>

        <button
          onClick={() => setActiveTab("chats")}
          id="nav-chats-btn"
          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
            activeTab === "chats"
              ? "bg-slate-900/90 text-white border border-slate-800 shadow-md shadow-black/40 font-bold"
              : "text-slate-450 hover:bg-slate-900/40 hover:text-white"
          }`}
        >
          <div className="flex items-center gap-3">
            <MessageSquare className={`w-4 h-4 ${activeTab === "chats" ? "text-yellow-400" : "text-slate-500"}`} />
            <span>Chat em Tempo Real</span>
          </div>
        </button>

        <button
          onClick={() => setActiveTab("flow")}
          id="nav-flow-btn"
          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
            activeTab === "flow"
              ? "bg-slate-900/90 text-white border border-slate-800 shadow-md shadow-black/40 font-bold"
              : "text-slate-450 hover:bg-slate-900/40 hover:text-white"
          }`}
        >
          <div className="flex items-center gap-3">
            <Settings2 className={`w-4 h-4 ${activeTab === "flow" ? "text-yellow-400" : "text-slate-500"}`} />
            <span>Fluxos & Skill de IA</span>
          </div>
        </button>

        <button
          onClick={() => setActiveTab("stats")}
          id="nav-stats-btn"
          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
            activeTab === "stats"
              ? "bg-slate-900/90 text-white border border-slate-800 shadow-md shadow-black/40 font-bold"
              : "text-slate-450 hover:bg-slate-900/40 hover:text-white"
          }`}
        >
          <div className="flex items-center gap-3">
            <BarChart3 className={`w-4 h-4 ${activeTab === "stats" ? "text-yellow-400" : "text-slate-500"}`} />
            <span>Economia & Logs</span>
          </div>
        </button>
      </div>

      {/* Localized Region Card */}
      <div className="p-4 m-4 bg-slate-900/50 rounded-xl border border-slate-900 text-xs flex flex-col gap-2" id="sidebar-region-card">
        <h3 className="font-semibold text-slate-300 flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-slate-400">
          📍 Base Regional
        </h3>
        <p className="text-slate-500 leading-relaxed text-[11.5px]">
          Filtros configurados com bases de concessionárias da Av. José Soares Pinheiro e adjacências para vendas automotivas locais em Itabuna BA.
        </p>
      </div>
    </div>
  );
}
