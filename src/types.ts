export type AtendimentoMode = "AI" | "HUMAN";

export interface Message {
  id: string;
  role: "user" | "assistant" | "system_alert" | "agent_human";
  text: string;
  timestamp: string;
  isButtonResponse?: boolean;
  buttons?: string[];
}

export interface Lead {
  id: string;
  companyId?: string;
  name: string;
  phone: string;
  lastMessage: string;
  lastMessageTime: string;
  mode: AtendimentoMode;
  currentStep: "opt_in" | "chatting" | "human_escalated";
  vehicleDetails?: {
    car?: string;
    year?: string;
    partsInterested?: string;
  };
  notes?: string;
  unreadCount: number;
  avatarColor: string;
}

export interface StorePreset {
  id: string;
  name: string;
  address: string;
  phone: string;
  workingHours: string;
  specialties: string[];
  features: string[];
}

export interface FlowConfig {
  optInText: string;
  optInButtons: string[];
  aiGreeting: string;
  aiSystemPrompt: string;
  escalationKeywords: string[];
  activeStoreId: string;
}

export interface WebhookSimLog {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  type: "text" | "button" | "template";
  payload: string;
  timestamp: string;
}

export interface WhatsAppConfig {
  provider: "AUTO" | "EVOLUTION" | "META";
  phoneNumberId: string;
  accessToken: string;
  verifyToken: string;
  useOpenAi: boolean;
  openAiKey: string;
  evolutionApiUrl: string;
  evolutionApiKey: string;
  evolutionInstanceName: string;
}
