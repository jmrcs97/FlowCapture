# 🎓 Guia: Usando FlowCapture para Treinar a IA

## 🎯 Objetivo

Usar a extensão FlowCapture para criar **workflows de exemplo** que demonstrem como:
- Abrir modais
- Expandir elementos
- Scroll de páginas
- Interagir com componentes complexos

Esses workflows serão usados como **exemplos de treinamento** para a IA do screenshot-tool aprender a gerar workflows similares.

---

## 🔄 Fluxo de Trabalho

### 1️⃣ Capture Interações

```
1. Abra a página alvo
2. Clique na extensão FlowCapture
3. Clique em "Start Recording"
4. Execute as ações que quer demonstrar:
   - Scrollar até uma seção
   - Clicar em botão de modal
   - Expandir altura de elemento
   - Fechar modal
5. Clique em "Stop Recording"
```

### 2️⃣ Exporte como Workflow IR

```
1. Clique no botão "Download"
2. Selecione "Workflow (IR)"
3. Salve o arquivo workflow_ir.json
```

### 3️⃣ Use como Exemplo de Treinamento

O workflow gerado pode ser adicionado aos prompts da IA como exemplo:

```markdown
# Exemplo: Como abrir modal e expandir conteúdo

Workflow gerado pela extensão FlowCapture:

[
  {
    "type": "START",
    "label": "Start",
    "params": { "url": "https://example.com" },
    "connections": [{ "to": 1, "condition": "success" }]
  },
  {
    "type": "WAIT",
    "label": "Wait for initial page load",
    "params": { "condition": "fixed-time", "timeoutMs": 2000 },
    "connections": [{ "to": 2, "condition": "success" }]
  },
  {
    "type": "CLICK",
    "label": "Click on \"View Details\"",
    "params": { "selector": ".btn-details" },
    "connections": [{ "to": 3, "condition": "success" }]
  },
  {
    "type": "WAIT",
    "label": "Wait for visual stability",
    "params": { "condition": "fixed-time", "timeoutMs": 500 },
    "connections": [{ "to": 4, "condition": "success" }]
  },
  {
    "type": "SCREENSHOT",
    "label": "Checkpoint screenshot",
    "params": {
      "captureMode": "page",
      "format": "png",
      "fullPage": true,
      "useDynamicHeight": true,
      "viewportWidth": 1440,
      "filename": "checkpoint-1234567890"
    },
    "connections": [{ "to": 5, "condition": "success" }]
  },
  {
    "type": "OUTPUT",
    "label": "Save results",
    "params": { "folderName": "flow-capture-output", "zip": false }
  }
]
```

---

## 📚 Casos de Uso para Treinamento

### Caso 1: Abrir Modal e Capturar

**Ações:**
1. Click em botão "Open Modal"
2. Esperar modal aparecer
3. Checkpoint (screenshot)

**Workflow gerado demonstra:**
- Sequência correta: CLICK → WAIT → SCREENSHOT
- Parâmetros apropriados para modal

---

### Caso 2: Scroll e Expandir Seção

**Ações:**
1. Scroll até seção específica
2. Click para expandir accordion
3. Checkpoint

**Workflow gerado demonstra:**
- SCROLL → CLICK → WAIT → SCREENSHOT
- Como lidar com lazy loading

---

### Caso 3: Formulário Multi-step

**Ações:**
1. Preencher campo 1
2. Preencher campo 2
3. Click "Next"
4. Preencher campo 3
5. Submit

**Workflow gerado demonstra:**
- TYPE → TYPE → CLICK → WAIT_FOR_NAVIGATION
- Sequência de formulários

---

## 🧠 Como Usar os Exemplos para Treinar a IA

### Estratégia 1: Few-Shot Learning

Adicione workflows de exemplo no prompt da IA:

```markdown
Você é um compilador de workflows. Aqui estão 3 exemplos de workflows corretos:

### Exemplo 1: Modal Expansion
[... workflow JSON ...]

### Exemplo 2: Accordion Interaction
[... workflow JSON ...]

### Exemplo 3: Form Submission
[... workflow JSON ...]

Agora, dado o HTML e objetivo do usuário, gere um workflow similar.
```

---

### Estratégia 2: Pattern Library

Crie uma biblioteca de padrões comuns:

```
patterns/
├── modal-open-capture.json
├── accordion-expand-all.json
├── form-multi-step.json
├── scroll-lazy-load.json
└── slider-expand.json
```

No prompt da IA:

```markdown
Padrões disponíveis:
1. modal-open-capture: CLICK → WAIT(element-exists) → SCREENSHOT
2. accordion-expand-all: SCROLL → ELEMENT_SCAN → FOR_EACH(CLICK + SCREENSHOT)
3. form-multi-step: TYPE... → CLICK → WAIT_FOR_NAVIGATION
```

---

### Estratégia 3: Validação por Comparação

Use os workflows gerados como ground truth para validar saída da IA:

```javascript
const capturedWorkflow = loadJSON('workflow_ir.json');
const aiGeneratedWorkflow = aiGenerate(html, userPrompt);

const similarity = compareWorkflows(capturedWorkflow, aiGeneratedWorkflow);

if (similarity < 0.8) {
  console.log('IA precisa de mais exemplos deste tipo');
}
```

---

## 📊 Formato de Workflow IR

Cada node tem:
```json
{
  "type": "CLICK | TYPE | WAIT | SCREENSHOT | ...",
  "label": "Descrição legível",
  "params": { /* parâmetros específicos do tipo */ },
  "connections": [
    { "to": 2, "condition": "success" }
  ]
}
```

### Tipos de Nodes Principais

| Type | Quando usar | Params principais |
|------|-------------|-------------------|
| `START` | Primeiro node (URL inicial) | `url` |
| `CLICK` | Clicar em elemento | `selector` |
| `TYPE` | Digitar em campo | `selector`, `text` |
| `SCROLL` | Scroll para revelar conteúdo | `mode`, `percentage`, `selector` |
| `WAIT` | Aguardar condição | `condition`, `timeoutMs` |
| `SCREENSHOT` | Capturar screenshot | `captureMode`, `fullPage` |
| `OUTPUT` | Último node (salvar resultados) | `folderName` |

---

## ✅ Checklist de Bom Exemplo

Um workflow de treinamento deve:

- ✅ Ter sequência lógica clara
- ✅ Incluir WAITs após ações que causam mudanças visuais
- ✅ Usar seletores reais do HTML (não inventados)
- ✅ Ter labels descritivos em cada node
- ✅ Demonstrar um padrão reutilizável
- ✅ Ter conexões corretas (índices to)
- ✅ Terminar com OUTPUT

---

## 🚀 Próximos Passos

1. **Coletar exemplos diversos**: Grave workflows para diferentes tipos de interação
2. **Categorizar**: Organize por tipo (modal, form, scroll, etc.)
3. **Adicionar ao prompt da IA**: Use como few-shot examples
4. **Iterar**: Compare workflows da IA com os capturados e refine

---

## 💡 Dicas Avançadas

### Simplificar Workflows para Treinamento

Às vezes o workflow capturado tem detalhes demais. Você pode editar manualmente para criar um exemplo mais limpo:

**Antes (capturado):**
```json
[
  START,
  WAIT(2000ms),
  CLICK(.btn),
  WAIT(100ms),  ← redundante
  WAIT(500ms),  ← pode mesclar
  SCREENSHOT
]
```

**Depois (otimizado para treinamento):**
```json
[
  START,
  WAIT(2000ms),
  CLICK(.btn),
  WAIT(500ms),
  SCREENSHOT
]
```

### Anotar Contexto

Adicione comentários nos exemplos:

```javascript
// Padrão: Modal que requer expansão de altura
// Complexidade: Média
// Caso de uso: Modais com conteúdo scrollável
{
  "type": "CLICK",
  "label": "Open modal",
  // ...
}
```

---

## 🎯 Objetivo Final

Criar uma biblioteca de workflows de exemplo que permita à IA:

1. **Reconhecer padrões** (ex: "abrir modal" sempre segue CLICK → WAIT)
2. **Aprender sequências** (ex: formulários sempre TYPE → TYPE → CLICK)
3. **Inferir WAITs** (quando adicionar, quanto tempo)
4. **Escolher nodes corretos** (SCREENSHOT vs SCREENSHOT_FLOW)

---

## 📦 Estrutura de Arquivos Recomendada

```
training-workflows/
├── README.md                    # Este documento
├── patterns/
│   ├── modals/
│   │   ├── simple-modal.json
│   │   ├── modal-with-scroll.json
│   │   └── modal-with-tabs.json
│   ├── forms/
│   │   ├── simple-form.json
│   │   ├── multi-step-form.json
│   │   └── form-with-validation.json
│   ├── navigation/
│   │   ├── scroll-lazy-load.json
│   │   └── infinite-scroll.json
│   └── interactions/
│       ├── accordion-expand.json
│       ├── tab-switching.json
│       └── dropdown-menu.json
└── prompt-examples.md           # Exemplos prontos para usar no prompt
```

---

Agora você pode usar a extensão FlowCapture como uma ferramenta de **demonstração** para ensinar a IA a criar workflows corretos! 🎓✨
