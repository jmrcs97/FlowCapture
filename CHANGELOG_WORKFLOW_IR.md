# ✨ FlowCapture - Workflow IR Integration

## 🎯 O Que Foi Implementado

A extensão FlowCapture agora pode exportar gravações em **2 formatos**:

### 1️⃣ Intent (Legacy)
- Formato original com análise semântica
- Usado para debug e análise
- Inclui metadados detalhados

### 2️⃣ Workflow IR (NOVO!)
- Formato compatível com screenshot-tool
- Array de nodes executáveis
- Compilado a partir das interações capturadas

---

## 📦 Arquivos Criados/Modificados

### ✅ Novos Arquivos

```
extension/src/shared/workflow-compiler.js   (320 linhas)
└── Compila steps capturados → workflow IR nodes
```

### ✏️ Arquivos Modificados

```
extension/src/shared/download.js
├── + import WorkflowCompiler
└── + createWorkflow(url, steps)

extension/src/popup/popup.html
├── + Download dropdown menu (2 opções)
└── + Ícones e acessibilidade (ARIA)

extension/src/popup/popup.css
└── + Estilos do dropdown menu (~100 linhas)

extension/src/popup/popup-ui.js
├── + _setupDropdownBehavior()
├── + toggleDropdown(), openDropdown(), closeDropdown()
└── + onDownloadFormatClick(handler)

extension/src/popup/popup.js
├── + import DownloadManager
└── + _handleDownload(format) com suporte para 'intent' e 'workflow'
```

---

## 🎨 Nova UI

### Antes:
```
┌──────────────────────┐
│  Download Result     │
└──────────────────────┘
```

### Depois:
```
┌──────────────────────────┐
│  Download (5 steps) ▼    │  ← Click abre menu
└──────────────────────────┘
        ↓ (dropdown)
┌──────────────────────────┐
│ 📄 Intent (Legacy)       │ ← Debug/análise
│    Debug & analysis      │
├──────────────────────────┤
│ 🌳 Workflow (IR)         │ ← Executável
│    Executable nodes      │
└──────────────────────────┘
```

---

## 🔄 Como Funciona

### Fluxo de Gravação

```
1. Usuário interage com página
   ↓
2. FlowCapture captura eventos:
   - click → { type: 'click', selector: '.btn', ... }
   - input → { type: 'input', selector: '#field', value: 'text' }
   - scroll → { type: 'scroll', delta: { y: 500 } }
   ↓
3. SessionManager processa em steps:
   {
     step_id: 'abc123',
     trigger: { type: 'click', selector: '.btn' },
     effects: { new_elements: [...] },
     visual_settling: { frames_observed: 5 }
   }
   ↓
4. Download em 2 formatos:
```

#### Formato Intent (Legacy)
```javascript
{
  url: "https://example.com",
  semantic_analysis: { ... },
  intent_analysis: {
    steps: [ /* steps capturados */ ]
  }
}
```

#### Formato Workflow IR (NOVO!)
```javascript
[
  {
    type: "START",
    label: "Start",
    params: { url: "https://example.com" },
    connections: [{ to: 1, condition: "success" }]
  },
  {
    type: "CLICK",
    label: "Click on button",
    params: { selector: ".btn" },
    connections: [{ to: 2, condition: "success" }]
  },
  {
    type: "WAIT",
    label: "Wait for visual stability",
    params: { condition: "fixed-time", timeoutMs: 500 },
    connections: [{ to: 3, condition: "success" }]
  },
  {
    type: "OUTPUT",
    label: "Save results",
    params: { folderName: "flow-capture-output", zip: false }
  }
]
```

---

## 🧠 Compilador: Mapeamento de Eventos → Nodes

| Evento Capturado | Node Gerado | Params |
|------------------|-------------|---------|
| `click` | `CLICK` | `selector`, `button` |
| `input` | `TYPE` | `selector`, `text`, `clearFirst: true` |
| `scroll` | `SCROLL` | `mode: 'percentage'`, `percentage`, `direction` |
| `submit` | `CLICK` + `WAIT_FOR_NAVIGATION` | Form submit sequence |
| `keydown` (Enter) | `CLICK` | Simula enter no elemento |
| `checkpoint` | `SCREENSHOT` | `fullPage: true`, `useDynamicHeight: true` |

### Regras Inteligentes

1. **Auto-WAIT**: Adiciona `WAIT` automático após ações que causam mudanças visuais
   ```javascript
   if (step.visual_settling.frames_observed > 2) {
     addWaitNode({ timeoutMs: settling.frames_observed * 16 });
   }
   ```

2. **Readable Labels**: Converte seletores em descrições legíveis
   ```javascript
   selector: ".btn-primary"     → label: "Click on button"
   selector: 'text::"Submit"'   → label: 'Click on "Submit"'
   ```

3. **Navigation Detection**: Detecta navegação e adiciona `expectNavigation: true`
   ```javascript
   if (effects.navigation_detected || effects.url_changed) {
     params.expectNavigation = true;
   }
   ```

---

## 🚀 Como Usar

### 1. Instalar Extensão
```bash
cd C:\Users\João\Desktop\FlowCapture\extension
# Carregar extensão no Chrome:
# chrome://extensions → Developer mode → Load unpacked → selecionar pasta extension/
```

### 2. Gravar Interações
```
1. Abra página alvo
2. Click no ícone da extensão
3. Start Recording
4. Execute ações (click, scroll, input, etc.)
5. Stop Recording
```

### 3. Exportar Workflow
```
1. Click em "Download"
2. Escolher formato:
   - Intent (Legacy): Para análise detalhada
   - Workflow (IR): Para executar no screenshot-tool
3. Arquivo salvo:
   - flow_capture_intent.json
   - workflow_ir.json
```

---

## 🎓 Uso para Treinamento da IA

**Objetivo:** Criar workflows de exemplo que demonstrem padrões corretos

### Exemplo: Modal Expansion

1. **Gravar:**
   - Click em "Open Modal"
   - Esperar modal aparecer
   - Checkpoint (botão camera)

2. **Exportar como Workflow IR**

3. **Usar no prompt da IA:**
   ```markdown
   # Exemplo: Como abrir modal

   Workflow correto gerado pela extensão FlowCapture:

   [
     { type: "START", ... },
     { type: "WAIT", ... },
     { type: "CLICK", params: { selector: ".modal-trigger" } },
     { type: "WAIT", params: { condition: "element-exists", selector: ".modal.show" } },
     { type: "SCREENSHOT", ... },
     { type: "OUTPUT", ... }
   ]

   Agora, dado o HTML abaixo, gere um workflow similar para o objetivo do usuário.
   ```

---

## 📋 Próximos Passos (Opcional)

### Fase 2: Auto-sync com screenshot-tool

```javascript
// Detectar se screenshot-tool está rodando
const isToolRunning = await fetch('http://localhost:3001/health').catch(() => false);

if (isToolRunning) {
  // Botão extra: "Send to Screenshot Tool"
  await fetch('http://localhost:3001/api/import-workflow', {
    method: 'POST',
    body: JSON.stringify(workflow)
  });
}
```

### Melhorias Futuras

- [ ] Otimizador de workflow (mesclar WAITs consecutivos)
- [ ] Editor visual de workflow
- [ ] Validador de workflow antes de exportar
- [ ] Comparador de workflows (capturado vs gerado pela IA)
- [ ] Templates de workflows comuns

---

## 🐛 Troubleshooting

### Dropdown não abre
- Verifique se popup.css foi atualizado
- Inspecione o popup: Botão direito → Inspecionar

### Download não funciona
- Verifique console: F12 → Console
- Erro comum: `workflow-compiler.js not found`
  - Solução: Verificar import em download.js

### Workflow vazio
- Certifique-se de ter gravado steps antes de parar
- Verifique se `intent.intent_analysis.steps` existe

---

## 📊 Estatísticas

| Métrica | Valor |
|---------|-------|
| Arquivos criados | 2 |
| Arquivos modificados | 4 |
| Linhas adicionadas | ~500 |
| Tipos de node suportados | 7 principais |
| Eventos capturáveis | 8 tipos |

---

**Status:** ✅ Implementação completa
**Testado:** ⏳ Aguardando teste manual
**Documentação:** ✅ Completa (GUIA_TREINAMENTO_IA.md)
