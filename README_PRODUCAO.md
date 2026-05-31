# 🚀 Guia de Implantação e Preparação para Produção
## Painel Inteligente de Atendimento Central Autocar (WhatsApp + AI Multi-Agent)

Este documento descreve detalhadamente todos os passos e configurações necessárias para retirar o sistema do modo Sandbox (simulador local) e implantá-lo de forma segura e escalável em um ambiente de produção real com **Firebase (Firestore & Auth)**, **WhatsApp Cloud API (Meta)**, e Inteligência Artificial (**OpenAI/Gemini**).

---

## 📋 Sumário
1. [Visão Geral da Arquitetura](#-visão-geral-da-arquitetura)
2. [Etapa 1: Configuração do Firebase de Produção](#-etapa-1-configuração-do-firebase-de-produção)
   - [Como aplicar as Regras de Segurança (Firestore Rules)](#como-aplicar-as-regras-de-segurança-firestore-rules)
   - [Habilitação dos Métodos de Autenticação (Auth)](#habilitação-dos-métodos-de-autenticação-auth)
3. [Etapa 2: Variáveis de Ambiente do Servidor (.env)](#-etapa-2-variáveis-de-ambiente-do-servidor-env)
4. [Etapa 3: Integração com a WhatsApp Cloud API (Meta)](#-etapa-3-integração-com-a-whatsapp-cloud-api-meta)
   - [Como configurar o Webhook de mensagens](#como-configurar-o-webhook-de-mensagens)
5. [Etapa 4: Configuração dos Motores de IA](#-etapa-4-configuração-dos-motores-de-ia)
6. [Etapa 5: Build, Execução e Deploy Físico](#-etapa-5-build-execução-e-deploy-físico)

---

## 🏛️ Visão Geral da Arquitetura

O sistema é construído como uma aplicação **Full-Stack unificada** (Express + Vite + React):
- **Front-end (Vite/React):** Painel administrativo que consome dados direto do Firestore em tempo real usando WebSockets integrados do SDK do Firebase.
- **Back-end (CJS Express Server compilado):** Servidor seguro rodando na porta `3000` (host `0.0.0.0`) que lida com Webhooks recebidos da Meta API (WhatsApp), processamento inteligente e envio de respostas automáticas sem expor chaves sensíveis ao cliente.

---

## 🔥 Etapa 1: Configuração do Firebase de Produção

Se o painel exibe o aviso de **Conexão Firestore Restrita (Permissão Negada)**, significa que suas regras de segurança padrão estão bloqueando o tráfego do painel. Siga os passos abaixo:

### Como aplicar as Regras de Segurança (Firestore Rules)

1. Acesse o [Firebase Console](https://console.firebase.google.com/).
2. Selecione o seu projeto ativo de produção (ex: `central-autocar`).
3. No painel esquerdo, clique em **Cloud Firestore** e depois acesse a aba **Rules (Regras)** no topo.
4. Substitua todo o conteúdo existente pelo código abaixo (que valida tipos de dados em produção e restringe leitura exclusivamente aos operadores e administradores logados):

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Bloqueio padrão global de segurança
    match /{document=**} {
      allow read, write: if false;
    }

    // Funções utilitárias de verificação
    function isSignedIn() {
      return request.auth != null;
    }

    function isValidId(id) {
      return id is string && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\-+() ]+$');
    }

    function isUserInDb() {
      return exists(/databases/$(database)/documents/users/$(request.auth.uid));
    }

    function getUserRole() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role;
    }

    function isAdmin() {
      return isSignedIn() && (
        (request.auth.token.email == "natanmarinhocontateste@gmail.com") ||
        (request.auth.token.email == "brisasofc@gmail.com") ||
        (isUserInDb() && getUserRole() == "admin")
      );
    }

    function isOperador() {
      return isSignedIn() && (
        (request.auth.token.email == "natanmarinhocontateste@gmail.com") ||
        (request.auth.token.email == "brisasofc@gmail.com") ||
        (isUserInDb() && (getUserRole() == "operador" || getUserRole() == "admin"))
      );
    }

    // Validadores de esquemas e dados
    function isValidUser(data) {
      return data.uid is string && data.uid.size() <= 128 &&
             data.email is string && data.email.size() <= 320 &&
             data.name is string && data.name.size() <= 200 &&
             data.role in ['admin', 'operador'] &&
             data.status in ['online', 'offline'];
    }

    function isValidLead(data) {
      return data.id is string && data.id.size() <= 128 &&
             data.name is string && data.name.size() <= 250 &&
             data.phone is string && data.phone.size() <= 32 &&
             data.lastMessage is string && data.lastMessage.size() <= 5000 &&
             data.mode in ['AI', 'HUMAN'] &&
             data.currentStep in ['opt_in', 'chatting', 'human_escalated'] &&
             data.unreadCount is int && data.unreadCount >= 0 &&
             data.avatarColor is string && data.avatarColor.size() <= 64;
    }

    function isValidMessage(data) {
      return data.id is string && data.id.size() <= 128 &&
             data.leadId is string && data.leadId.size() <= 128 &&
             data.role in ['user', 'assistant', 'system_alert', 'agent_human'] &&
             data.text is string && data.text.size() <= 10000;
    }

    function isValidFlowConfig(data) {
      return data.optInText is string && data.optInText.size() <= 10000 &&
             data.optInButtons is list && data.optInButtons.size() <= 10 &&
             data.aiGreeting is string && data.aiGreeting.size() <= 10000 &&
             data.aiSystemPrompt is string && data.aiSystemPrompt.size() <= 30000 &&
             data.escalationKeywords is list && data.escalationKeywords.size() <= 100 &&
             data.activeStoreId is string && data.activeStoreId.size() <= 64;
    }

    function isValidWhatsAppConfig(data) {
      return data.phoneNumberId is string && data.phoneNumberId.size() <= 128 &&
             data.accessToken is string && data.accessToken.size() <= 1000 &&
             data.verifyToken is string && data.verifyToken.size() <= 128 &&
             data.useOpenAi is bool &&
             data.openAiKey is string && data.openAiKey.size() <= 500;
    }

    function isValidAnalytics(data) {
      return data.totalLeads is int && data.totalLeads >= 0 &&
             data.aiHandled is int && data.aiHandled >= 0 &&
             data.humanHandled is int && data.humanHandled >= 0 &&
             data.conversationsSaved is int && data.conversationsSaved >= 0 &&
             data.averageConfidence is int && data.averageConfidence >= 0 &&
             data.savedTokens is int && data.savedTokens >= 0 &&
             data.responseTimeSavedSec is int && data.responseTimeSavedSec >= 0;
    }

    function isValidWebhookLog(data) {
      return data.id is string && data.id.size() <= 128 &&
             data.direction in ['INBOUND', 'OUTBOUND'] &&
             data.type in ['text', 'button', 'template'] &&
             data.payload is string && data.payload.size() <= 50000;
    }

    // Permissões das coleções
    match /users/{userId} {
      allow read: if isSignedIn() && (request.auth.uid == userId || isAdmin());
      allow create: if isSignedIn() && request.auth.uid == userId && isValidUser(request.resource.data);
      allow update: if isSignedIn() && (request.auth.uid == userId || isAdmin()) && isValidUser(request.resource.data) &&
                     (isAdmin() || (request.resource.data.role == resource.data.role));
    }

    match /leads/{leadId} {
      allow list: if isOperador();
      allow get: if isOperador() && isValidId(leadId);
      allow create, write, update: if isOperador() && isValidId(leadId) && isValidLead(request.resource.data);
    }

    match /leads/{leadId}/messages/{messageId} {
      allow list: if isOperador() && isValidId(leadId);
      allow get: if isOperador() && isValidId(leadId) && isValidId(messageId);
      allow create, write, update: if isOperador() && isValidId(leadId) && isValidId(messageId) && isValidMessage(request.resource.data);
    }

    match /flows/config {
      allow read: if isOperador();
      allow create, write, update: if isOperador() && isValidFlowConfig(request.resource.data);
    }

    match /settings/whatsapp {
      allow read: if isOperador();
      allow create, write, update: if isOperador() && isValidWhatsAppConfig(request.resource.data);
    }

    match /analytics/current {
      allow read: if isOperador();
      allow create, write, update: if isOperador() && isValidAnalytics(request.resource.data);
    }

    match /webhook_logs/{logId} {
      allow list: if isOperador();
      allow get: if isOperador() && isValidId(logId);
      allow create, write, update: if isOperador() && isValidId(logId) && isValidWebhookLog(request.resource.data);
    }
  }
}
```

5. Clique em **Publish (Publicar)**. O painel se tornará funcional instantaneamente em tempo real!

### Habilitação dos Métodos de Autenticação (Auth)

1. No menu lateral do Firebase local, clique em **Authentication**.
2. Clique na aba **Sign-in Method** e adicione:
   - **E-mail / Senha** (Ativar).
   - **Google** (Ativar para suportar o login rápido do painel).
3. Salve as mudanças.

---

## 🔑 Etapa 2: Variáveis de Ambiente do Servidor (.env)

Em seu ambiente de hospedagem de produção (como VPS, Cloud Run, Vercel, Railway, Render, etc.), ou no arquivo `.env` de produção, configure as variáveis listadas abaixo. Elas são secretas e nunca vazam para o navegador do cliente:

```bash
# Porta padrão de escuta do servidor Express
PORT=3000

# URL pública de produção onde a aplicação está hospedada (Sem barra no final)
# Importante: Exigido pela Meta para redirecionamento correto dos logs e do painel
APP_URL="https://sua-central-autocar.com"

# Motores de Inteligência Artificial para Automação de Balcão e Peças
GEMINI_API_KEY="AIzaSy..."       # Sua Chave de API do Google Gemini
OPENAI_API_KEY="sk-proj-..."    # Sua Chave de API da OpenAI (Caso use GPT-4/GPT-3.5)

# Credenciais da WhatsApp Cloud API (Obtidas no Meta for Developers)
META_PHONE_NUMBER_ID="109212001"                         # ID do número de telefone de produção
META_ACCESS_TOKEN="EAAG..."                              # Token de acesso permanente do usuário do sistema
META_VERIFY_TOKEN="minha_paparazzi_chave_secreta_123"    # Token arbitrário que você define e insere na Meta
```

> ⚠️ **Segurança:** Nunca publique chaves reais em seu sistema de controle de versão (como Git). Sempre forneça estas variáveis utilizando o console de administração do seu servidor de hospedagem.

---

## 💬 Etapa 3: Integração com a WhatsApp Cloud API (Meta)

O back-end do sistema possui um endpoint pronto para escutar o aplicativo oficial do WhatsApp (`/api/webhook`).

### Como configurar o Webhook de mensagens

1. Acesse o portal [Meta for Developers](https://developers.facebook.com/).
2. Clique no seu aplicativo associado ou crie um novo aplicativo comercial.
3. No lado esquerdo, clique em **WhatsApp** e selecione **Configuração (Configuration)**.
4. No campo **URL de retorno de chamada (Callback URL)**, insira o domínio de produção com o caminho da API do webhook:
   ```txt
   https://seu-dominio-producao.com/api/webhook
   ```
5. No campo **Token de Verificação (Verify Token)**, digite o mesmo conteúdo que você escreveu na variável de ambiente `META_VERIFY_TOKEN` (por exemplo: `minha_paparazzi_chave_secreta_123`).
6. Clique em **Salvar**.
7. Na mesma página, em **Campos de Webhook (Webhook Fields)**, localize o campo **messages** e clique em **Assinar (Subscribe)**. Isso garante que sempre que um cliente enviar uma mensagem ou botão para o seu número, a Meta enviará o evento para o seu servidor Express.

---

## 🧠 Etapa 4: Configuração dos Motores de IA

O sistema está preparado para processar a conversação usando dois caminhos redundantes:
- **Redundância Integrada (Settings):** Os operadores podem ir direto na aba do painel do console do WhatsApp e alterar a chave `openAiKey` ou configurar os prompts diretamente pela interface do painel em tempo real, que as informações serão persistidas no Firestore na coleção `/settings/whatsapp` e `/flows/config`.
- **Híbrido de Servidor:** Se nenhuma chave for colocada pela tela, o servidor Express de produção usará automaticamente o `process.env.OPENAI_API_KEY` ou a `process.env.GEMINI_API_KEY` definidas nas variáveis de ambiente globais de servidor mencionadas na Etapa 2.

---

## 🏗️ Etapa 5: Build, Execução e Deploy Físico

O sistema utiliza a arquitetura de compilação eficiente usando Vite e Esbuild:

### Executando em desenvolvimento (Dev com auto reload)
```bash
npm run dev
```

### Compilando para Produção (Build)
```bash
npm run build
```
*Este comando gera dois artefatos essenciais:*
- A pasta `dist/` contendo os ativos estáticos otimizados do React (HTML, CSS minificado, JS particionado).
- O arquivo compilado autossuficiente em formato CommonJS `dist/server.cjs` por meio do `esbuild`, livre de restrições de importações de arquivos TypeScript do Node no servidor.

### Rodando o Servidor de Produção
```bash
npm start
```
O servidor Express lerá os arquivos de build estáticos e levantará as rotas de Webhook diretamente no host `0.0.0.0` e porta `3000`. Utilize ferramentas como o **PM2** ou contêineres **Docker** para garantir que o seu servidor permaneça ativo em segundo plano!
