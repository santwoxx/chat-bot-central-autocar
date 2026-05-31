# 🚗 Central Autocar - Painel Inteligente de Atendimento (WhatsApp + IA Multi-Agent)

Este projeto foi reestruturado de forma modular e otimizada para o padrão de produção real. As responsabilidades foram 100% segregadas, separando o painel de gerenciamento (Frontend React + Vite) do motor de orçamentos e webhooks (Backend Node.js/Express).

---

## 📂 Organização das Pastas (Produção)

```
/
├── frontend/             # 💻 Painel Administrativo Comercial
│   ├── src/              # Componentes de UI, hooks de sincronia ao vivo com Firestore, Auth e roteamento
│   ├── package.json      # Dependências otimizadas de cliente (React, Tailwind, Motion, Lucide)
│   └── vite.config.ts    # Configuração de build para deploy estático (ex: Vercel, Netlify)
│
├── backend/              # ⚙️ Motor de Webhooks, IA & Filas Sequenciais
│   ├── server.ts         # Servidor Express com fila deduplicada para alta concorrência
│   ├── src/server/       # Configuração de IA (Gemini/OpenAI), Firestore e regras comerciais
│   ├── package.json      # Dependências de servidor (Node, Express, OpenAI, @google/genai)
│   └── tsconfig.json     # Diretrizes de compilação CJS/ESM seguras para ambientes de nuvem (ex: Render)
│
└── README_PRODUCAO.md    # 📕 Guia Passo a Passo de Implantação e Variáveis (.env)
```

---

## 🚀 Como Executar em Produção

### 1. Frontend (Hospedagem na Vercel o Netlify)
O frontend consome e sintoniza dados diretamente do Cloud Firestore em tempo real. Ele detecta se o projeto possui credenciais Firebase válidas no browser ou se deve operar no modo Sandbox Simulado off-grid.
```bash
cd frontend
npm install
npm run build
```
Implante o diretório de saída `dist/` gerado na Vercel ou na plataforma de sua preferência.

### 2. Backend (Hospedagem no Render, Railway ou VPS)
O backend lida com webhooks de entrada Meta WhatsApp, classifica intenções em tempo real por meio de IA, processa filas sequenciais de alta concorrência por número de telefone e dispara mensagens e notificações automáticas de transição/escalação humana.
```bash
cd backend
npm install
npm run build
npm start
```
Configure o serviço no **Render** para rodar `npm run build` e dar o start com `npm start` definindo a variável de ambiente `PORT=3000`.

---

## 📕 Documentação de Configurações Completas
Para ver como extrair credenciais permanentes de Webhooks WhatsApp Cloud API, registrar no Meta Developer Console, configurar o redirecionamento `/api/webhook` de produção, habilitar Auth Google/E-mail e registrar chaves seguras OpenAI/Gemini, leia o **[README_PRODUCAO.md](./README_PRODUCAO.md)**.
