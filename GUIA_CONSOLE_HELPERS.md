# 🎨 Guia: Console Helpers para Capturar CSS

## 🎯 Como Funciona

Quando você inicia a gravação, a extensão injeta helpers globais no console que permitem capturar mudanças de CSS **manualmente**.

---

## 📝 Comandos Disponíveis

### 1️⃣ `captureStyle(selector, property, value, priority)`

Captura mudança de **uma propriedade CSS**.

**Sintaxe:**
```javascript
captureStyle(selector, property, value, priority = 'important')
```

**Exemplos:**
```javascript
// Expandir altura do modal
captureStyle('.modal-body', 'height', '2000px', 'important')

// Remover max-height
captureStyle('.modal-content', 'max-height', 'none', 'important')

// Alterar overflow
captureStyle('.scrollable', 'overflow', 'visible', 'important')

// Setar altura do pai
captureStyle('.modal-dialog', 'height', '100%', 'important')
```

**Resultado no Workflow:**
```json
{
  "type": "SET_STYLE",
  "label": "Set height on .modal-body",
  "params": {
    "selector": ".modal-body",
    "property": "height",
    "value": "2000px",
    "priority": "important"
  },
  "connections": [{ "to": 3, "condition": "success" }]
}
```

---

### 2️⃣ `captureExpand(selector, mode)`

Captura expansão de elemento usando node **EXPAND**.

**Sintaxe:**
```javascript
captureExpand(selector, mode = 'scroll-measure')
```

**Modos:**
- `'scroll-measure'` (padrão): Scroll + medir scrollHeight + aplicar
- `'fit-content'`: Ajustar para conteúdo
- `'until-target-visible'`: Expandir até target visível

**Exemplos:**
```javascript
// Expandir modal com scroll automático
captureExpand('.modal-body', 'scroll-measure')

// Expandir accordion
captureExpand('.accordion-content', 'fit-content')

// Expandir até footer aparecer
captureExpand('.infinite-scroll', 'until-target-visible')
```

**Resultado no Workflow:**
```json
{
  "type": "EXPAND",
  "label": "Expand .modal-body",
  "params": {
    "mode": "scroll-measure",
    "container": ".modal-body",
    "clearAncestorConstraints": true,
    "scrollStep": 100,
    "scrollDelay": 200,
    "keepScrollbar": true,
    "resetScroll": true,
    "useHeightOffset": true,
    "heightOffset": -10
  },
  "connections": [{ "to": 4, "condition": "success" }]
}
```

---

### 3️⃣ `captureStyles(selector, stylesObject, priority)`

Captura **múltiplas propriedades CSS** de uma vez.

**Sintaxe:**
```javascript
captureStyles(selector, { property: value, ... }, priority = 'important')
```

**Exemplos:**
```javascript
// Resetar constraints de modal
captureStyles('.modal-content', {
  height: 'auto',
  maxHeight: 'none',
  overflow: 'visible'
}, 'important')

// Ajustar pai do modal
captureStyles('.modal-dialog', {
  height: '100%',
  maxHeight: '100vh',
  display: 'flex',
  alignItems: 'flex-start'
}, 'important')
```

**Resultado no Workflow:**
```json
[
  {
    "type": "SET_STYLE",
    "label": "Set height on .modal-content",
    "params": { "selector": ".modal-content", "property": "height", "value": "auto", "priority": "important" }
  },
  {
    "type": "SET_STYLE",
    "label": "Set maxHeight on .modal-content",
    "params": { "selector": ".modal-content", "property": "maxHeight", "value": "none", "priority": "important" }
  },
  {
    "type": "SET_STYLE",
    "label": "Set overflow on .modal-content",
    "params": { "selector": ".modal-content", "property": "overflow", "value": "visible", "priority": "important" }
  }
]
```

---

## 🚀 Fluxo de Trabalho Completo

### Cenário: Capturar modal com altura editada

```javascript
// 1. Iniciar gravação (click na extensão)

// 2. Abrir modal
// (click no botão via UI)

// 3. No console, capturar mudanças de CSS:

// Expandir corpo do modal
captureExpand('.modal-body', 'scroll-measure')

// Ajustar pai
captureStyle('.modal-dialog', 'height', '100%', 'important')

// Remover constraints
captureStyles('.modal-content', {
  maxHeight: 'none',
  overflow: 'visible'
}, 'important')

// 4. Checkpoint (screenshot)
// (click no botão câmera da extensão)

// 5. Parar gravação

// 6. Download → Workflow (IR)
```

---

## 📊 Workflow Gerado

```json
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
    "label": "Click on \"Open Modal\"",
    "params": { "selector": ".btn-open-modal" },
    "connections": [{ "to": 3, "condition": "success" }]
  },
  {
    "type": "WAIT",
    "label": "Wait for visual stability",
    "params": { "condition": "fixed-time", "timeoutMs": 500 },
    "connections": [{ "to": 4, "condition": "success" }]
  },
  {
    "type": "EXPAND",
    "label": "Expand .modal-body",
    "params": {
      "mode": "scroll-measure",
      "container": ".modal-body",
      "clearAncestorConstraints": true,
      "scrollStep": 100,
      "scrollDelay": 200,
      "keepScrollbar": true,
      "resetScroll": true,
      "useHeightOffset": true,
      "heightOffset": -10
    },
    "connections": [{ "to": 5, "condition": "success" }]
  },
  {
    "type": "SET_STYLE",
    "label": "Set height on .modal-dialog",
    "params": {
      "selector": ".modal-dialog",
      "property": "height",
      "value": "100%",
      "priority": "important"
    },
    "connections": [{ "to": 6, "condition": "success" }]
  },
  {
    "type": "SET_STYLE",
    "label": "Set maxHeight on .modal-content",
    "params": {
      "selector": ".modal-content",
      "property": "maxHeight",
      "value": "none",
      "priority": "important"
    },
    "connections": [{ "to": 7, "condition": "success" }]
  },
  {
    "type": "SET_STYLE",
    "label": "Set overflow on .modal-content",
    "params": {
      "selector": ".modal-content",
      "property": "overflow",
      "value": "visible",
      "priority": "important"
    },
    "connections": [{ "to": 8, "condition": "success" }]
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
      "filename": "checkpoint-..."
    },
    "connections": [{ "to": 9, "condition": "success" }]
  },
  {
    "type": "OUTPUT",
    "label": "Save results",
    "params": { "folderName": "flow-capture-output", "zip": false }
  }
]
```

---

## ✅ Checklist de Uso

- [ ] Iniciar gravação na extensão
- [ ] Executar ações de UI (click, scroll, etc.)
- [ ] **Abrir console (F12)**
- [ ] Usar `captureExpand()` ou `captureStyle()` conforme necessário
- [ ] Checkpoint para screenshots
- [ ] Parar gravação
- [ ] Download como "Workflow (IR)"
- [ ] Usar workflow como exemplo de treinamento!

---

## 💡 Dicas

### Quando usar `captureExpand` vs `captureStyle`

| Situação | Use |
|----------|-----|
| Modal com scroll interno | `captureExpand('.modal-body', 'scroll-measure')` |
| Altura específica conhecida | `captureStyle('.element', 'height', '2000px')` |
| Resetar constraints de altura | `captureStyles('.parent', { height: 'auto', maxHeight: 'none' })` |
| Múltiplas propriedades | `captureStyles()` (mais clean) |

### Seletores

✅ **BOM:**
```javascript
captureStyle('.modal-body', 'height', '2000px')
captureStyle('#main-modal .content', 'overflow', 'visible')
```

❌ **RUIM:**
```javascript
captureStyle('div > div > div', 'height', '2000px')  // Selector frágil
```

### Debugging

Se o helper não funciona:
```javascript
// Verificar se está gravando
console.log(window.flowCapture)  // Deve existir

// Verificar selector
document.querySelector('.modal-body')  // Deve encontrar elemento
```

---

## 🎓 Para Treinar a IA

O workflow gerado com esses helpers é **PERFEITO** para treinar a IA a:

1. **Reconhecer quando usar EXPAND** vs SET_STYLE
2. **Aprender sequências** (CLICK → EXPAND → SET_STYLE → SCREENSHOT)
3. **Ver exemplos reais** de manipulação de modais/sliders
4. **Entender clearAncestorConstraints** (quando usar)

Adicione esses workflows à biblioteca de exemplos! 📚

---

**Arquivo relacionado:** `GUIA_TREINAMENTO_IA.md`
