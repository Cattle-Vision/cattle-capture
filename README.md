# CattleCapture — Plataforma de Captura e Curadoria de Dataset Bovino

> **Importante — Diferença entre CattleCapture e CattleVision**
>
> O ecossistema possui dois sistemas que compartilham a mesma interface (**Agro Precisão**), fluxo de manejo, prontuário sanitário, modo offline e **IA de identificação/enquadramento anatômico**, mas têm **objetivos distintos**:
>
> | Recurso | **CattleCapture** (`cattle-capture`) | **CattleVision** (`cattle-vision-frontend` + `cattle-vision-backend`) |
> |---|---|---|
> | **Finalidade principal** | **Captura padronizada e curadoria do dataset zootécnico** | **Avaliação zootécnica completa com escore corporal (ICS)** |
> | **IA de Identificação / Enquadramento (`identifier.onnx` + guardas)** | **Sim** (Edge ONNX no navegador + validação no servidor) | **Sim** (Edge ONNX no navegador + validação no servidor) |
> | **IA de Avaliação de ICS (`YOLO26m` / Escala 1,0–5,0)** | **Não possui** (intencionalmente removida) | **Sim** (motor `YOLO26m` + fila persistente `IcsJob`) |
> | **Prontuário, Saúde, GPS, Guarda Compartilhada, BLE RFID & Offline PWA** | **Sim** | **Sim** |
> | **Arquitetura** | Monólito Next.js App Router + NextAuth v5 + Prisma (PostgreSQL) | Frontend Next.js + Backend Express/Prisma + Worker Python/ONNX |
>
> Em resumo: use o **CattleCapture** exclusivamente para coletar, validar o enquadramento anatômico e exportar datasets limpos para pesquisa/treinamento. Utilize o **CattleVision** quando precisar calcular o **Índice de Condição Corporal (ICS)** dos animais.

---

## Funcionalidades do CattleCapture

- **Design System "Agro Precisão" & PWA Offline-First**: Interface adaptada para uso em campo/curral (tema claro/escuro), instalável como PWA com fila de sincronização em IndexedDB + Service Worker para operar sem conexão com a internet.
- **IA de Identificação e Enquadramento Embarcada (`identifier.onnx`)**:
  - Execução local via `onnxruntime-web` com prévia em tempo real (`300ms`) na câmera e validação automática pré-upload de imagens da galeria.
  - Guardas semânticos (`version-RFB-320.onnx` e `yolo11n.onnx`) para filtrar rostos humanos ou objetos fora do escopo antes de aceitar a captura.
  - Validação e recalibração sequencial no servidor (`onnxruntime-node`) com segunda passada por crop central (`68%`).
- **Leitor RFID Bluetooth Low Energy (BLE)**: Integração via Web Bluetooth com firmware ESP32 (`CattleVision-RFID` / `finalesp`) para identificação instantânea ou vinculação de brinco eletrônico na ficha do animal.
- **Prontuário Zootécnico Completo**:
  - Dados biométricos: brinco/identificador único, apelido, raça, sexo, peso (kg), idade (meses) e comprimento (cm).
  - Rastreabilidade de localização: piquete/lote, endereço, coordenadas GPS e histórico cronológico de movimentações.
  - Controle sanitário e de campo: registro de vacinas, histórico clínico de doenças/tratamentos e observações categorizadas.
- **Guarda Compartilhada**: Compartilhamento de acesso à ficha de cada animal por e-mail com colaboradores/veterinários e transferência de titularidade.
- **Painel Administrativo & Exportação do Dataset**:
  - Gestão de usuários (`USER` / `ADMIN`).
  - Reavaliação em lote de enquadramento das capturas.
  - Exportação completa em ZIP contendo imagens originais, `metadata.csv` e `manifest.json` com metadados zootécnicos.

---

## Stack Tecnológica

- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4
- **Autenticação**: NextAuth v5 (`next-auth` Credentials + JWT)
- **Banco de Dados**: PostgreSQL com Prisma ORM v5
- **Visão Computacional**: `onnxruntime-web` (client-side) e `onnxruntime-node` + `sharp` (server-side)
- **Exportação**: `adm-zip`

---

## Configuração e Execução Local

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente (.env)
# DATABASE_URL="postgresql://..."
# AUTH_SECRET="..."

# 3. Aplicar schema/migrations do Prisma e gerar client
npx prisma generate
npx prisma migrate deploy

# 4. Iniciar em modo desenvolvimento
npm run dev
```

Para validar o build de produção localmente:

```bash
npx tsc --noEmit
npm run build
```
