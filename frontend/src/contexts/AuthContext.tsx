import React, { createContext, useContext, useState, useEffect } from "react";
import { 
  User as FirebaseUser, 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut,
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider
} from "firebase/auth";
import { 
  doc, 
  getDoc, 
  setDoc
} from "firebase/firestore";
import { auth, db, handleFirestoreError, OperationType } from "../firebase/config.ts";

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: "admin" | "operador";
  status: "online" | "offline";
  createdAt: any;
}

interface AuthContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  createDemoCompanyAndUser: (companyName: string, userName: string, userEmail: string) => Promise<void>;
  isMockMode: boolean; // True when Firestore firebase-applet-config is unconfigured/offline
  setMockMode: (val: boolean) => void;
  firestorePermissionError: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMockMode, setIsMockMode] = useState(false);
  const [firestorePermissionError, setFirestorePermissionError] = useState(false);

  const setMockMode = (val: boolean) => {
    setIsMockMode(val);
  };

  // Load user profile and configs from Firestore on login
  const loadProfileAndCompany = async (fUser: FirebaseUser) => {
    try {
      setFirestorePermissionError(false);
      const userRef = doc(db, "users", fUser.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const uData = userSnap.data() as UserProfile;
        setProfile(uData);
      } else {
        // First-time user registered: provision default user profile with role 'admin'
        const newProfile: UserProfile = {
          uid: fUser.uid,
          email: fUser.email || "",
          name: fUser.displayName || fUser.email?.split("@")[0] || "Operador",
          role: "admin",
          status: "online",
          createdAt: new Date().toISOString()
        };

        await setDoc(doc(db, "users", fUser.uid), newProfile);

        // Provision default Central Autocar flows and accounts at root if not exists
        const flowRef = doc(db, "flows", "config");
        const flowSnap = await getDoc(flowRef);
        if (!flowSnap.exists()) {
          await setDoc(flowRef, {
            optInText: "Olá! Seja bem-vindo à central de atendimento inteligente da Central Autocar. 🚗💨\n\nPor favor, confirme se deseja iniciar o atendimento tocando em um dos botões abaixo para que nossa inteligência de balcão possa te ajudar com preços e marcas com segurança e sem banimentos!",
            optInButtons: ["🔍 Fazer Cotação", "📍 Endereço / Contato", "⏳ Falar com Humano"],
            aiGreeting: "Perfeito! Obrigado por confirmar seu interesse. Eu sou o Assistente Virtual inteligente de peças da Central Autocar.\n\nComo posso te auxiliar com peças ou orçamentos hoje? Por favor, informe o modelo do veículo e o ano se possível!",
            aiSystemPrompt: "Você é o especialista de balcão de vendas inteligente de autopeças da Central Autocar em Itabuna BA. Domine peças, marcas, mecânica básica, atendimento amigável e regional.\n\nRegras cruciais de comunicação:\n1. NÃO fale mentiras sobre preços exatos se não souber. Peça para confirmar com o setor de vendas se o cliente insistir em fechar e diga que vai transferi-lo.\n2. Seja profissional, prestativo e utilize termos automobilísticos corretos.\n3. Sempre use português brasileiro nativo e cortês.\n4. Sempre que o cliente decidir comprar, fechar, perguntar sobre formas exatas de pagamento, pedir desconto crítico ou solicitar explicitamente um humano/vendedor, use termos que engajem a transição automática.",
            escalationKeywords: ["comprar", "fechar", "quanto fica", "pix", "atendente", "humano", "boleto", "cartao", "cartão", "desconto", "falar com pessoa", "vendedor", "finalizar", "compora", "preco", "preço", "orçamento fechado"],
            activeStoreId: "jal"
          });
        }

        const waRef = doc(db, "settings", "whatsapp");
        const waSnap = await getDoc(waRef);
        if (!waSnap.exists()) {
          await setDoc(waRef, {
            phoneNumberId: "109212001",
            accessToken: "",
            verifyToken: "opt_in_prevent_ban",
            useOpenAi: false,
            openAiKey: ""
          });
        }

        const analyticsRef = doc(db, "analytics", "current");
        const analyticsSnap = await getDoc(analyticsRef);
        if (!analyticsSnap.exists()) {
          await setDoc(analyticsRef, {
            totalLeads: 0,
            aiHandled: 0,
            humanHandled: 0,
            conversationsSaved: 0,
            averageConfidence: 94,
            savedTokens: 0,
            responseTimeSavedSec: 0
          });
        }

        setProfile(newProfile);
      }
      setIsMockMode(false);
    } catch (err) {
      console.error("Erro ao carregar perfil do Firestore. Ativando Modo Sandbox Local:", err);
      const errMsg = err instanceof Error ? err.message : String(err);
      if (
        errMsg.includes("permission") || 
        errMsg.includes("permissions") || 
        errMsg.includes("permission-denied") ||
        errMsg.includes("insufficient permissions")
      ) {
        setFirestorePermissionError(true);
      }
      setIsMockMode(true);
      try {
        handleFirestoreError(err, OperationType.GET, `users/${fUser.uid}`);
      } catch (e) {
        // Subdue exception to prevent uncaught runtime errors in browser while successfully writing JSON data to console
      }
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      if (result.user) {
        setUser(result.user);
        await loadProfileAndCompany(result.user);
      }
    } catch (error) {
      console.error("Falha no login com Email e Senha:", error);
      throw error;
    }
  };

  const signInWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      if (result.user) {
        setUser(result.user);
        await loadProfileAndCompany(result.user);
      }
    } catch (error) {
      console.error("Falha no login com Google:", error);
      throw error;
    }
  };

  const signOutUser = async () => {
    try {
      await firebaseSignOut(auth);
      setUser(null);
      setProfile(null);
    } catch (error) {
      console.error("Falha de SignOut:", error);
    }
  };

  // Setup simulated credentials if Firestore is offline
  const createDemoCompanyAndUser = async (companyName: string, userName: string, userEmail: string) => {
    setIsMockMode(true);
    const mockUid = "demo_operator_uid_123";
    setUser({
      uid: mockUid,
      email: userEmail,
      displayName: userName,
      emailVerified: true,
    } as FirebaseUser);

    setProfile({
      uid: mockUid,
      email: userEmail,
      name: userName,
      role: "admin",
      status: "online",
      createdAt: new Date().toISOString()
    });
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fUser) => {
      setLoading(true);
      if (fUser) {
        setUser(fUser);
        await loadProfileAndCompany(fUser);
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    }, (error) => {
      console.error("Auth state error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        signInWithEmail,
        signInWithGoogle,
        signOutUser,
        createDemoCompanyAndUser,
        isMockMode,
        setMockMode,
        firestorePermissionError
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth deve ser usado com AuthProvider");
  }
  return context;
}
