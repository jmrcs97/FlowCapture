# 🎯 FlowCapture → Workflow IR: Guia Completo

## 📋 Status da Implementação

✅ **Completo:** Exportar workflows em formato IR
✅ **Completo:** Console helpers para capturar CSS
✅ **Completo:** Dropdown UI com 2 formatos
⚠️ **Limitação:** Seletores gerados podem ser frágeis
⚠️ **Requer:** Uso manual dos console helpers

---

## 🎯 O Que Foi Implementado

### 1. Dropdown de Download (2 Formatos)

```
┌──────────────────────────┐
│  Download (5 steps) ▼    │  ← Click
└──────────────────────────┘
        ↓
┌──────────────────────────┐
│ 📄 Intent (Legacy)       │ ← Debug/análise
│ 🌳 Workflow (IR)         │ ← Executável ✨
└──────────────────────────┘
```

### 2. Workflow Compiler

Traduz eventos capturados → nodes IR:

| Evento | Node Gerado |
|--------|-------------|
| click | CLICK |
| input | TYPE |
| scroll | SCROLL |
| checkpoint | SCREENSHOT |
| **captureStyle()** | **SET_STYLE** ✨ |
| **captureExpand()** | **EXPAND** ✨ |

### 3. Console Helpers (NOVO!)

Durante gravação, use no console:

```javascript
// Expandir elemento
captureExpand('.modal-body', 'scroll-measure')

// Setar CSS
captureStyle('.modal-dialog', 'height', '100%')

// Múltiplos estilos
captureStyles('.modal-content', {
  maxHeight: 'none',
  overflow: 'visible'
})
```

---

## ⚠️ Problemas Identificados

### Problema 1: SET_STYLE Não Aparece no Workflow

**Causa:** Você editou CSS no DevTools Elements, não usou console helpers

**Sintoma:**
```json
// Workflow gerado:
[
  { "type": "CLICK" },
  { "type": "EXPAND" },  // ← Automático
  { "type": "PRINT" }    // ← Aviso
  // ❌ Falta SET_STYLE!
]
```

**Solução:** Use console helpers durante gravação:
```javascript
captureStyle('.modal-dialog', 'height', '100%')
```

📚 **Ver:** `DEVTOOLS_VS_CONSOLE.md`

---

### Problema 2: Seletores Frágeis

**Causa:** SelectorEngine gera seletores genéricos

**Sintoma:**
```json
{ "selector": "li:nth-of-type(2)" }  // ❌ Frágil
```

```
Erro ao executar:
⚠️ Waiting for selector failed
```

**Solução:** Editar JSON após gerar, usar seletores melhores:
```json
{ "selector": "text::\"Benefits Investigation\"" }  // ✅ Robusto
{ "selector": "#modal-benefits .content" }         // ✅ ID único
{ "selector": "[data-modal='benefits']" }          // ✅ data-attr
```

📚 **Ver:** `MELHORAR_SELETORES.md`

---

## 🚀 Fluxo de Trabalho Completo

### Fase 1: Gravar com Extensão

```
1. Recarregar extensão
   chrome://extensions → ⟳ Reload

2. Abrir página alvo

3. Start Recording

4. Executar ações via UI:
   - Scroll
   - Click em modal
   - etc.

5. ⚡ Abrir Console (F12 → Console)

6. Usar helpers para CSS:
   captureExpand('.modal-body', 'scroll-measure')
   captureStyle('.modal-dialog', 'height', '100%')
   captureStyles('.modal-content', {
     maxHeight: 'none',
     overflow: 'visible'
   })

7. Checkpoint (botão câmera)

8. Stop Recording

9. Download → Workflow (IR)
```

### Fase 2: Corrigir Seletores

```
1. Abrir workflow_ir.json

2. Para cada CLICK/TYPE/EXPAND:
   - Verificar selector
   - Se for nth-of-type → RUIM
   - Substituir por ID, data-attr ou text::

3. Testar seletores:
   - Abrir página
   - Console: document.querySelector('selector')
   - Se retornar elemento → OK
   - Se null → Precisa corrigir

4. Salvar JSON corrigido
```

### Fase 3: Usar para Treinar IA

```
1. Workflow corrigido = Exemplo perfeito

2. Adicionar ao prompt da IA:
   "Exemplo: Como expandir modal

   [cole workflow JSON]

   Agora gere workflow similar para..."

3. IA aprende:
   - Sequência: CLICK → EXPAND → SET_STYLE → SCREENSHOT
   - Quando usar EXPAND vs SET_STYLE
   - Seletores robustos
```

---

## 📚 Documentação

### Guias Principais

| Arquivo | Conteúdo |
|---------|----------|
| **EXEMPLO_PRATICO.md** | ⭐ Comece aqui! Teste em 2 min |
| **DEVTOOLS_VS_CONSOLE.md** | Diferença crítica entre DevTools e Console |
| **GUIA_CONSOLE_HELPERS.md** | Referência completa dos helpers |
| **MELHORAR_SELETORES.md** | Como corrigir seletores frágeis |
| **TESTE_RAPIDO.md** | Debugging se não funcionar |
| **GUIA_TREINAMENTO_IA.md** | Como usar para treinar IA |

### Documentação Técnica

| Arquivo | Conteúdo |
|---------|----------|
| CHANGELOG_WORKFLOW_IR.md | Resumo técnico da implementação |

---

## ✅ Checklist de Sucesso

### Durante Gravação:
- [ ] Extensão recarregada
- [ ] Console aberto (F12)
- [ ] Mensagem "Style Helpers Available" visível
- [ ] Ações via UI (click, scroll)
- [ ] **CSS via Console** (captureStyle, captureExpand)
- [ ] Checkpoint no final

### Após Gravação:
- [ ] Download → Workflow (IR)
- [ ] JSON contém SET_STYLE nodes
- [ ] JSON contém EXPAND nodes
- [ ] Seletores verificados (não nth-of-type)

### Antes de Usar:
- [ ] Seletores testados no console
- [ ] Workflow executável no screenshot-tool
- [ ] ✅ Pronto para treinar IA!

---

## 🐛 Troubleshooting Rápido

### Console helpers não funcionam?
```javascript
// Teste:
window.captureStyle
// Se 'undefined' → helpers não carregados
// Solução: Recarregar extensão + refresh página
```

### Workflow sem SET_STYLE?
- ❌ Editou no DevTools Elements
- ✅ Use console: captureStyle()

### Workflow falha ao executar?
- Seletores frágeis (nth-of-type)
- Edite JSON com seletores melhores
- Use text::"Texto" quando possível

### Seletor não encontra elemento?
```javascript
// Teste na página:
document.querySelector('.seu-selector')
// null → selector ruim
// element → selector bom
```

---

## 🎓 Exemplos de Workflows

### Exemplo 1: Modal com Height Editado

**Gravação:**
```javascript
// 1-2. Start + Click modal
// 3. Console:
captureExpand('.modal-body', 'scroll-measure')
captureStyle('.modal-dialog', 'height', '100%')
captureStyles('.modal-content', {
  maxHeight: 'none',
  overflow: 'visible'
})
// 4. Checkpoint + Stop
```

**Workflow Gerado:**
```json
[
  { "type": "START", ... },
  { "type": "CLICK", "params": { "selector": "text::\"Open Modal\"" } },
  { "type": "EXPAND", "params": { "container": ".modal-body", "mode": "scroll-measure" } },
  { "type": "SET_STYLE", "params": { "selector": ".modal-dialog", "property": "height", "value": "100%" } },
  { "type": "SET_STYLE", "params": { "selector": ".modal-content", "property": "maxHeight", "value": "none" } },
  { "type": "SET_STYLE", "params": { "selector": ".modal-content", "property": "overflow", "value": "visible" } },
  { "type": "SCREENSHOT", ... },
  { "type": "OUTPUT", ... }
]
```

---

## 🔧 Arquivos Criados

```
FlowCapture/
├── extension/
│   ├── src/
│   │   ├── popup/
│   │   │   ├── popup.html          (✏️ dropdown menu)
│   │   │   ├── popup.css           (✏️ dropdown styles)
│   │   │   ├── popup.js            (✏️ handlers)
│   │   │   └── popup-ui.js         (✏️ UI logic)
│   │   ├── content/
│   │   │   ├── content.js          (✏️ inject helpers)
│   │   │   ├── core/
│   │   │   │   └── session-manager.js (✏️ novos eventos)
│   │   │   └── helpers/
│   │   │       └── style-capture.js   (✨ NOVO)
│   │   └── shared/
│   │       ├── download.js         (✏️ createWorkflow)
│   │       └── workflow-compiler.js   (✨ NOVO)
│   └── manifest.json
│
├── EXEMPLO_PRATICO.md              (✨ NOVO)
├── DEVTOOLS_VS_CONSOLE.md          (✨ NOVO)
├── GUIA_CONSOLE_HELPERS.md         (✨ NOVO)
├── MELHORAR_SELETORES.md           (✨ NOVO)
├── TESTE_RAPIDO.md                 (✨ NOVO)
├── GUIA_TREINAMENTO_IA.md          (✨ NOVO)
├── CHANGELOG_WORKFLOW_IR.md        (✨ NOVO)
└── README_COMPLETO.md              (✨ VOCÊ ESTÁ AQUI)
```

---

## 🎯 Próximos Passos

1. **Teste básico** (EXEMPLO_PRATICO.md)
   - [ ] captureStyle('body', 'background', 'red')
   - [ ] Verificar JSON tem SET_STYLE

2. **Grave workflow real** (GUIA_CONSOLE_HELPERS.md)
   - [ ] Modal com heights editados
   - [ ] Usar console helpers
   - [ ] Verificar workflow completo

3. **Corrija seletores** (MELHORAR_SELETORES.md)
   - [ ] Substituir nth-of-type
   - [ ] Usar text:: ou IDs
   - [ ] Testar no console

4. **Use para IA** (GUIA_TREINAMENTO_IA.md)
   - [ ] Workflow = exemplo de treinamento
   - [ ] Adicionar ao prompt
   - [ ] IA aprende padrões!

---

## 💡 Dica Final

**O fluxo ideal:**

1. Grave naturalmente (click, scroll via UI)
2. **Pause antes de editar CSS**
3. Console → captureStyle/captureExpand
4. Continue gravação
5. Download → Workflow
6. Edite seletores se necessário
7. Pronto para treinar IA! ✨

---

**Tudo implementado e documentado! 🎉**

Qualquer dúvida, consulte os guias específicos.
