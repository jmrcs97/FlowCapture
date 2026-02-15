# 🚀 Exemplo Prático: Teste em 2 Minutos

## Objetivo

Testar se os console helpers estão funcionando e gerar um workflow com **SET_STYLE nodes**.

---

## 🎯 Teste Simples (Qualquer Página)

### 1. Prepare

```
1. Recarregue extensão:
   chrome://extensions → FlowCapture → ⟳ Reload

2. Vá para QUALQUER página:
   Exemplo: https://google.com
```

### 2. Grave

```
1. Click na extensão
2. Start Recording
3. F12 → Console
```

### 3. No Console, digite:

```javascript
// Teste 1: Mudar cor de fundo
captureStyle('body', 'background', 'red', 'important')

// Teste 2: Mudar padding
captureStyle('body', 'padding', '50px', 'important')

// Teste 3: Múltiplos estilos
captureStyles('body', {
  margin: '0',
  fontSize: '20px',
  color: 'white'
}, 'important')
```

Você deve ver:
```
✅ FlowCapture: Captured style change - body { background: red important }
✅ FlowCapture: Captured style change - body { padding: 50px important }
✅ FlowCapture: Captured 3 style changes - body { margin: 0; fontSize: 20px; color: white }
```

### 4. Finalize

```
1. Click no botão câmera (checkpoint)
2. Stop Recording
3. Download → Workflow (IR)
```

---

## ✅ Verifique o JSON

Abra `workflow_ir.json` e procure por:

```json
[
  { "type": "START", ... },
  { "type": "WAIT", ... },

  // ⬇️ DEVEM ESTAR AQUI ⬇️
  {
    "type": "SET_STYLE",
    "label": "Set background on body",
    "params": {
      "selector": "body",
      "property": "background",
      "value": "red",
      "priority": "important"
    }
  },
  {
    "type": "SET_STYLE",
    "label": "Set padding on body",
    "params": {
      "selector": "body",
      "property": "padding",
      "value": "50px",
      "priority": "important"
    }
  },
  {
    "type": "SET_STYLE",
    "label": "Set margin on body",
    "params": {
      "selector": "body",
      "property": "margin",
      "value": "0",
      "priority": "important"
    }
  },
  {
    "type": "SET_STYLE",
    "label": "Set fontSize on body",
    "params": {
      "selector": "body",
      "property": "fontSize",
      "value": "20px",
      "priority": "important"
    }
  },
  {
    "type": "SET_STYLE",
    "label": "Set color on body",
    "params": {
      "selector": "body",
      "property": "color",
      "value": "white",
      "priority": "important"
    }
  },

  { "type": "SCREENSHOT", ... },
  { "type": "OUTPUT", ... }
]
```

---

## 🎯 Agora Seu Caso Real (Modal)

Se o teste acima **funcionou** ✅, agora faça com seu modal:

```javascript
// 1. Start Recording

// 2. Scroll + Click modal (via UI)

// 3. No Console:

// Expandir o scrollable do modal
captureExpand('.modal-body', 'scroll-measure')

// Setar height do pai
captureStyle('.modal-dialog', 'height', '100%', 'important')

// Resetar constraints
captureStyles('.modal-content', {
  height: 'auto',
  maxHeight: 'none',
  overflow: 'visible'
}, 'important')

// 4. Checkpoint + Stop + Download
```

**Resultado esperado:**
```json
[
  { "type": "CLICK", "label": "Click on modal trigger" },
  {
    "type": "EXPAND",
    "label": "Expand .modal-body",
    "params": { "mode": "scroll-measure", "container": ".modal-body", ... }
  },
  {
    "type": "SET_STYLE",
    "label": "Set height on .modal-dialog",
    "params": { "selector": ".modal-dialog", "property": "height", "value": "100%", ... }
  },
  {
    "type": "SET_STYLE",
    "label": "Set height on .modal-content",
    "params": { "selector": ".modal-content", "property": "height", "value": "auto", ... }
  },
  {
    "type": "SET_STYLE",
    "label": "Set maxHeight on .modal-content",
    "params": { "selector": ".modal-content", "property": "maxHeight", "value": "none", ... }
  },
  {
    "type": "SET_STYLE",
    "label": "Set overflow on .modal-content",
    "params": { "selector": ".modal-content", "property": "overflow", "value": "visible", ... }
  },
  { "type": "SCREENSHOT", ... }
]
```

---

## 🐛 Se Não Funcionar

### Erro 1: Console não mostra mensagens

**Sintoma:**
```javascript
captureStyle('body', 'background', 'red')
// Nada acontece, sem mensagem ✅
```

**Debug:**
```javascript
// Verifique se existe:
console.log(typeof window.captureStyle)
// Esperado: 'function'
// Se for 'undefined' → helpers não foram injetados
```

**Solução:**
1. Verifique se arquivo existe:
   ```
   C:\Users\João\Desktop\FlowCapture\extension\src\content\helpers\style-capture.js
   ```

2. Recarregue página APÓS recarregar extensão

---

### Erro 2: Mensagem aparece mas JSON não tem SET_STYLE

**Sintoma:**
```
✅ FlowCapture: Captured style change - body { background: red important }
```
Mas JSON não tem o node.

**Debug:**
```javascript
// Após Stop Recording, no console:
window.flowCapture.stateManager.getSteps()

// Procure por:
// { trigger: { type: 'style_change', styleChange: { ... } } }
```

**Se encontrar:** Bug no compilador
**Se NÃO encontrar:** Step não foi salvo

---

## 📊 Resultado Final

Após esse teste, você terá:

✅ Workflow com SET_STYLE nodes
✅ Exemplo perfeito para treinar a IA
✅ Prova de conceito funcionando

Agora é só repetir para seus modais reais! 🚀

---

**Arquivos relacionados:**
- `GUIA_CONSOLE_HELPERS.md` - Referência completa
- `DEVTOOLS_VS_CONSOLE.md` - Diferenças críticas
- `TESTE_RAPIDO.md` - Debugging
