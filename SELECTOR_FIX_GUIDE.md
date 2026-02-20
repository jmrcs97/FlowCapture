# 🔧 Guia: Corrigir Erros de Seletores em Workflows

## ❌ Problema Atual

O workflow está falhando após fechar o primeiro modal:

```
✅ Modal 1 - FUNCIONA
   - Click, Expand, Screenshot ✅
   - Click "Close" ✅

❌ Modal 2 - FALHA
   - Click "Eligible patients can receive" ✅
   - Click "An electronic prescription (eR" ❌
   - Erro: Waiting for selector `div.quote-content > div:nth-of-type(4) > div.list-details > p.fw-bold:nth-of-type(1)` failed
```

## 🔍 Causa Raiz

O workflow foi gravado com **seletores posicionais** (`nth-of-type`) que funcionam apenas no Modal 1:

```html
<!-- Modal 1 -->
<div class="quote-content">
  <div>...</div>
  <div>...</div>
  <div>...</div>
  <div>         <!-- ← nth-of-type(4) aponta aqui -->
    <div class="list-details">
      <p class="fw-bold">1—SEND Benefits investigation</p>
    </div>
  </div>
</div>

<!-- Modal 2 (estrutura diferente!) -->
<div class="quote-content">
  <div>...</div>
  <div>         <!-- ← nth-of-type(4) NÃO existe ou aponta para outro elemento! -->
    <div class="list-details">
      <p class="fw-bold">1—START An electronic prescription</p>
    </div>
  </div>
</div>
```

Cada modal tem **conteúdo diferente** → **estrutura DOM diferente** → **seletores posicionais não funcionam**.

---

## ✅ Solução

### Passo 1: Verificar Novo Selector Engine

1. Abra `C:\Users\João\Desktop\FlowCapture\extension\test-selector-engine.html` no Chrome
2. Clique nos elementos de teste
3. Verifique no console que os seletores gerados são baseados em **conteúdo**, não em **posição**

**Exemplo de seletor esperado:**

```javascript
// ❌ OLD (posicional - quebra em Modal 2):
"div.quote-content > div:nth-of-type(4) > div.list-details > p.fw-bold"

// ✅ NEW (conteúdo - funciona em todos os modais):
"//p[@class='fw-bold'][contains(text(),'Benefits investigation')]"
// OU
"aria/Benefits investigation request"
```

### Passo 2: Recarregar Extensão

1. Vá para `chrome://extensions`
2. Encontre **FlowCapture**
3. Clique no botão **⟳ Recarregar**
4. Ou desabilite e reabilite a extensão

### Passo 3: Re-gravar Workflow

**IMPORTANTE:** Agora você precisa escolher uma estratégia:

#### **Opção A: Workflow Genérico (Recomendado se estrutura é similar)**

Grave um workflow que funcione em **todos os modais** usando seletores genéricos:

1. **Ative a gravação** no FlowCapture
2. **Abra UM modal qualquer**
3. **Expanda o modal** (Ctrl+Shift+E)
4. **Tire screenshot** (Ctrl+Shift+C)
5. **Feche o modal**
6. **Pare a gravação**

O novo workflow terá seletores como:
- `aria/Close` para o botão fechar (funciona em todos os modais)
- `//button[@class='btn-close'][@aria-label='Close']` (XPath com atributos)

Depois você pode **reusar esse workflow** em um LOOP que itera sobre todos os modais.

#### **Opção B: Workflows Separados por Modal**

Grave um workflow específico para cada modal:

1. **Workflow_Modal1.json** - Captura "Benefits investigation request"
2. **Workflow_Modal2.json** - Captura "An electronic prescription"
3. **Workflow_Modal3.json** - etc.

Cada workflow terá seletores específicos para o conteúdo daquele modal.

#### **Opção C: Usar LOOP com Seletores de Conteúdo**

Use o backend Screenshot Tool para criar um workflow com loop:

```json
{
  "type": "ELEMENT_SCAN",
  "params": {
    "container": ".modal-container",
    "itemSelector": ".modal-item",
    "storeAs": "modals"
  }
},
{
  "type": "FOR_EACH_ELEMENT",
  "params": {
    "arrayVar": "modals",
    "actions": [
      {
        "type": "CLICK",
        "label": "Open modal",
        "params": { "useLoopElement": true }
      },
      {
        "type": "EXPAND",
        "params": {
          "container": ".quote-content",
          "mode": "fit-content"
        }
      },
      {
        "type": "SCREENSHOT",
        "params": { "selector": ".quote-content" }
      },
      {
        "type": "CLICK",
        "label": "Close modal",
        "params": { "selector": "aria/Close" }
      }
    ]
  }
}
```

---

## 🧪 Testar Novo Workflow

### Teste Manual

1. Execute o novo workflow
2. Verifique que funciona no **Modal 1**
3. Feche o modal
4. Abra o **Modal 2**
5. Execute o workflow novamente
6. **Se funcionar nos dois modais** → seletores estão genéricos! ✅

### Teste Automatizado

Use o backend para executar o workflow e verificar:

```bash
# No terminal do backend
curl -X POST http://localhost:3000/api/crawl \
  -H "Content-Type: application/json" \
  -d '{
    "workflowGraph": { ... seu workflow aqui ... }
  }'
```

---

## 📊 Comparação: OLD vs NEW

| Aspecto | OLD Selector Engine | NEW Selector Engine |
|---------|-------------------|-------------------|
| **IDs Duplicados** | ❌ Sempre seleciona primeiro | ✅ Detecta duplicatas, usa XPath/Aria |
| **Carrossel** | ❌ nth-of-type quebra ao reordenar | ✅ Usa classes ou conteúdo |
| **Modais Diferentes** | ❌ Seletores específicos ao primeiro modal | ✅ Seletores baseados em conteúdo/aria |
| **Estratégias** | 5 (ID → class → nth → text → heading) | 10 (ID → XPath → Aria → data-* → class → path → nth → text → img-alt → heading) |
| **Robustez** | Frágil (quebra com DOM changes) | Robusto (adapta a mudanças estruturais) |

---

## 🎯 Checklist de Validação

Antes de usar o novo workflow em produção:

- [ ] Extensão FlowCapture recarregada
- [ ] Teste de selector engine executado (test-selector-engine.html)
- [ ] Seletores gerados são baseados em conteúdo (XPath/Aria), não nth-of-type
- [ ] Workflow testado em **pelo menos 2 modais diferentes**
- [ ] Botão "Close" funciona em todos os modais
- [ ] EXPAND funciona corretamente
- [ ] Screenshots capturadas com conteúdo completo

---

## 💡 Dicas Adicionais

### 1. Verificar Seletores Durante Gravação

Abra o console durante a gravação e veja os seletores sendo gerados:

```javascript
// No console do Chrome
window.flowCapture.selectorEngine.computeSelector(document.querySelector('.seu-elemento'))
```

### 2. Forçar Estratégia Específica

Se você quer garantir que um elemento use XPath:

```javascript
// Durante gravação, teste no console
const el = document.querySelector('.seu-elemento');
window.flowCapture.selectorEngine.getMultipleCandidates(el, 10)
// Escolha o candidato XPath da lista
```

### 3. Preferir ARIA Labels

Para botões e elementos interativos, ARIA labels são os mais robustos:

```html
<!-- ✅ MELHOR -->
<button aria-label="Close modal">×</button>
<!-- Seletor: aria/Close modal -->

<!-- ❌ EVITAR -->
<button class="btn-close">×</button>
<!-- Seletor: .btn-close (pode ter múltiplos) -->
```

### 4. Usar Data Attributes para Elementos Dinâmicos

Se você controla o HTML, adicione atributos data-* únicos:

```html
<div data-modal-id="benefits-investigation">
  <!-- conteúdo -->
</div>
```

O selector engine vai priorizar `[data-modal-id='benefits-investigation']`.

---

## 🆘 Troubleshooting

### Problema: "FlowCapture não está disponível no test-selector-engine.html"

**Solução:**
1. Recarregue a extensão em `chrome://extensions`
2. Verifique se a extensão está **Ativada**
3. Recarregue a página de teste
4. Verifique no console: `window.flowCapture` deve existir

### Problema: "Seletores ainda usando nth-of-type"

**Possível causa:** Elemento não tem características únicas (sem ID, classe, texto, aria-label)

**Solução:**
- Adicione `aria-label` aos elementos importantes
- Adicione classes únicas
- Use seletores baseados em texto próximo

### Problema: "Workflow funciona no Modal 1 mas falha no Modal 2"

**Causa:** Seletores ainda são específicos ao Modal 1

**Solução:**
- Use **Opção B** (workflows separados) OU
- Use **Opção C** (LOOP com seletores genéricos) OU
- Grave novamente focando em elementos com **conteúdo textual único**

---

## 📚 Recursos

- [Selector Engine Code](C:\Users\João\Desktop\FlowCapture\extension\src\content\core\selector-engine.js)
- [Backend Smart Selector](c:\Users\João\Desktop\screenshot-tool-main\backend\src\worker\smartSelector.js)
- [Test File](C:\Users\João\Desktop\FlowCapture\extension\test-selector-engine.html)
- [Memory Doc](C:\Users\João\.claude\projects\c--Users-Jo-o-Desktop-screenshot-tool-main\memory\MEMORY.md)

---

## ✅ Próximos Passos

1. **Executar teste** → Verificar seletores
2. **Escolher estratégia** → Genérico / Separados / Loop
3. **Re-gravar workflow** → Com novo engine
4. **Testar em múltiplos modais** → Validar robustez
5. **Deploy** → Usar em produção

🎉 Com o novo selector engine, seus workflows vão funcionar de forma consistente em todos os modais e resistir a mudanças estruturais do DOM!
