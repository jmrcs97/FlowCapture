# 🧪 Teste Rápido: Verificar Console Helpers

## ⚠️ Problema Identificado

Seu workflow não mostra os `SET_STYLE` nodes porque **você não usou os helpers do console**.

O workflow atual só tem:
- ✅ EXPAND nodes (gerados automaticamente)
- ✅ PRINT nodes (avisos sobre layout shift)
- ❌ **SET_STYLE nodes (NÃO estão lá!)**

---

## 🔍 Como Testar se os Helpers Estão Funcionando

### 1️⃣ Recarregar Extensão
```
chrome://extensions → FlowCapture → ⟳ Reload
```

### 2️⃣ Abrir Página e Gravar
```
1. Vá para uma página qualquer
2. Abra extensão → Start Recording
```

### 3️⃣ Abrir Console e Verificar
```
F12 → Console

Você deve ver esta mensagem:
  "FlowCapture Style Helpers Available:
     captureStyle(selector, property, value, priority)
     captureExpand(selector, mode)
     captureStyles(selector, stylesObject, priority)"
```

❓ **Se NÃO aparecer**, os helpers não foram injetados!

### 4️⃣ Testar Comandos Básicos
```javascript
// No console, digite:
window.flowCapture
// Deve retornar: Object { selectorEngine, sessionManager, ... }

// Agora teste capturar estilo:
captureStyle('body', 'background', 'red', 'important')
// Deve aparecer: ✅ FlowCapture: Captured style change - body { background: red important }
```

### 5️⃣ Parar e Baixar
```
Stop Recording → Download → Workflow (IR)
```

### 6️⃣ Verificar JSON
Procure por:
```json
{
  "type": "SET_STYLE",
  "label": "Set background on body",
  "params": {
    "selector": "body",
    "property": "background",
    "value": "red",
    "priority": "important"
  }
}
```

---

## 🐛 Se NÃO Funcionar

### Problema 1: Helpers não injetados

**Sintoma:** Console não mostra mensagem dos helpers

**Solução:**
1. Abra DevTools da extensão:
   - F12 na página
   - Console → Gear icon → "Preserve log"
   - Recarregue a página
   - Procure por erros `FlowCapture: Style helpers not loaded`

2. Verifique se o arquivo existe:
   ```
   C:\Users\João\Desktop\FlowCapture\extension\src\content\helpers\style-capture.js
   ```

3. Veja se content.js está importando:
   ```javascript
   import(resolveModule('src/content/helpers/style-capture.js'))
   ```

### Problema 2: Helpers existem mas comandos falham

**Sintoma:** `captureStyle is not defined`

**Solução:**
```javascript
// Tente chamar diretamente:
window.captureStyle('body', 'background', 'red')

// Se não funcionar, verifique:
console.log(typeof window.captureStyle)  // Deve ser 'function'
```

### Problema 3: Eventos capturados mas não compilados

**Sintoma:** Console mostra ✅ mas workflow não tem SET_STYLE

**Solução:** Verifique se os steps foram salvos:
1. Abra console após parar gravação
2. Digite:
   ```javascript
   window.flowCapture.stateManager.getSteps()
   ```
3. Procure por steps com `trigger.type === 'style_change'`

---

## ✅ Workflow Correto (Com Console Helpers)

Quando você USA os helpers, o workflow deve ficar assim:

```json
[
  { "type": "START", ... },
  { "type": "WAIT", ... },
  { "type": "CLICK", "label": "Click on modal trigger", ... },
  { "type": "WAIT", ... },

  // ⬇️ ESTES DEVEM APARECER se você usou os helpers! ⬇️
  {
    "type": "SET_STYLE",
    "label": "Set height on .modal-body",
    "params": {
      "selector": ".modal-body",
      "property": "height",
      "value": "2000px",
      "priority": "important"
    }
  },
  {
    "type": "SET_STYLE",
    "label": "Set height on .modal-dialog",
    "params": {
      "selector": ".modal-dialog",
      "property": "height",
      "value": "100%",
      "priority": "important"
    }
  },

  { "type": "SCREENSHOT", ... },
  { "type": "OUTPUT", ... }
]
```

---

## 🎯 Exemplo Completo: Capturar Modal com Heights Editados

### Passo a Passo:

```javascript
// 1. Start Recording (via extensão)

// 2. Scroll até seção (via UI)

// 3. Click em botão do modal (via UI)

// 4. ⭐ AGORA USE OS HELPERS NO CONSOLE:

// Expandir modal body
captureExpand('.modal-body', 'scroll-measure')
// ✅ FlowCapture: Captured expand - .modal-body (mode: scroll-measure)

// Setar height do dialog
captureStyle('.modal-dialog', 'height', '100%', 'important')
// ✅ FlowCapture: Captured style change - .modal-dialog { height: 100% important }

// Resetar constraints do content
captureStyles('.modal-content', {
  height: 'auto',
  maxHeight: 'none',
  overflow: 'visible'
}, 'important')
// ✅ FlowCapture: Captured 3 style changes - .modal-content { ... }

// 5. Checkpoint (botão câmera)

// 6. Stop Recording

// 7. Download → Workflow (IR)
```

---

## 📊 Comparação

### ❌ Sem Console Helpers (Seu workflow atual):
- EXPAND automático (detectado)
- PRINT avisos (layout shift)
- **Falta:** SET_STYLE para heights específicos

### ✅ Com Console Helpers (Esperado):
- EXPAND (via `captureExpand`)
- SET_STYLE (.modal-body, height: 2000px)
- SET_STYLE (.modal-dialog, height: 100%)
- SET_STYLE (.modal-content, maxHeight: none)
- SET_STYLE (.modal-content, overflow: visible)

---

## 🚨 Teste Agora!

Execute este teste rápido e me diga:

1. ✅ ou ❌ Console mostra mensagem dos helpers?
2. ✅ ou ❌ `captureStyle('body', 'background', 'red')` funciona?
3. ✅ ou ❌ Workflow gerado contém node SET_STYLE?

Se algum for ❌, há um bug na implementação que preciso corrigir!
