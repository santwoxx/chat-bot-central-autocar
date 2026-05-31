import React from "react";
import { Bot, User, ShieldAlert, CheckCheck, Car } from "lucide-react";
import { Lead } from "../types.ts";

interface LeadCardProps {
  key?: string;
  lead: Lead;
  isSelected: boolean;
  onClick: () => void;
}

export default function LeadCard({ lead, isSelected, onClick }: LeadCardProps) {
  // Format dates beautifully
  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  return (
    <button
      onClick={onClick}
      id={`lead-card-${lead.id}`}
      className={`w-full text-left p-4 rounded-xl transition-all border flex flex-col gap-2.5 outline-none cursor-pointer ${
        isSelected
          ? "bg-slate-50 border-yellow-250 border-l-4 border-l-yellow-400 shadow-sm"
          : "bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {/* Custom Avatar representation */}
          <div className={`w-10 h-10 rounded-full ${lead.avatarColor} text-white flex items-center justify-center font-bold font-mono text-sm shadow-inner relative`}>
            {lead.name.charAt(0)}
            
            {/* Overlay mode badges on Avatar directly */}
            <span className={`absolute -bottom-1 -right-1 p-0.5 rounded-full border text-white ${
              lead.mode === "AI" ? "bg-yellow-400 border-white" : "bg-orange-600 border-white"
            }`}>
              {lead.mode === "AI" ? (
                <Bot className="w-3 h-3 text-slate-950" />
              ) : (
                <User className="w-3 h-3" />
              )}
            </span>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 text-sm leading-tight flex items-center gap-1">
              {lead.name}
            </h4>
            <p className="text-[11px] text-slate-500 font-mono mt-0.5">{lead.phone}</p>
          </div>
        </div>

        <span className="text-[10px] text-slate-400 font-mono">
          {formatTime(lead.lastMessageTime)}
        </span>
      </div>

      {/* Vehicle details chip inside list card to speed up operator context */}
      {lead.vehicleDetails && (lead.vehicleDetails.car || lead.vehicleDetails.partsInterested) && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100/85 rounded-md text-[11px] text-slate-600">
          <Car className="w-3 nav-icon text-slate-400 shrink-0" />
          <span className="truncate max-w-[200px]">
            {lead.vehicleDetails.car} • {lead.vehicleDetails.partsInterested || "Geral"}
          </span>
        </div>
      )}

      {/* Message preview of last conversation state */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500 truncate flex-1 leading-snug">
          {lead.lastMessage}
        </p>

        {lead.unreadCount > 0 && (
          <span className="bg-red-500 text-white text-[10px] font-bold font-mono px-2 py-0.5 rounded-full shrink-0">
            {lead.unreadCount} Un
          </span>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 pt-2 mt-0.5">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
          lead.currentStep === "opt_in" 
            ? "bg-amber-100 text-amber-800" 
            : lead.currentStep === "human_escalated" 
              ? "bg-orange-100 text-orange-700"
              : "bg-yellow-100 text-yellow-800"
        }`}>
          {lead.currentStep === "opt_in" 
            ? "Aguardando Opt-In" 
            : lead.currentStep === "human_escalated" 
              ? "Aguardando Humano" 
              : "IA Ativa"}
        </span>

        <span className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
          <CheckCheck className="w-3.5 h-3.5 text-yellow-500" />
          Anti-banimento OK
        </span>
      </div>
    </button>
  );
}
