# 🎯 Problema: Seletores Frágeis

## ❌ O Que Está Acontecendo

Seu workflow tem seletores genéricos que não funcionam:

```json
{
  "type": "CLICK",
  "label": "Click on \"Benefits investigation (BI) su\"",
  "params": {
    "selector": "li:nth-of-type(2)"  // ❌ Frágil!
  }
}
```

**Erro ao executar:**
```
⚠️ Erro: Waiting for selector `button.accordion-button` failed
```

---

## 🔍 Por Que Isso Acontece?

A extensão usa a **SelectorEngine** para gerar seletores automaticamente, mas às vezes ela gera seletores genéricos como:
- `li:nth-of-type(2)` ← Depende da posição
- `div[role="dialog"]` ← Muito genérico
- `button` ← Pode pegar qualquer botão

Esses seletores **funcionam durante a gravação** mas **falham na execução** porque:
- Ordem dos elementos muda
- Elementos dinâmicos aparecem/desaparecem
- Página pode ter múltiplos elementos iguais

---

## ✅ Solução: Seletores Mais Específicos

### Opção 1: Melhorar Seletores Manualmente (Rápido)

Após gerar o workflow, **edite o JSON** com seletores melhores:

#### ❌ Antes (Frágil):
```json
{
  "type": "CLICK",
  "params": {
    "selector": "li:nth-of-type(2)"
  }
}
```

#### ✅ Depois (Robusto):
```json
{
  "type": "CLICK",
  "params": {
    "selector": ".access-support-list li[data-benefit-type='investigation']"
  }
}
```

**Ou use `text::` para botões:**
```json
{
  "type": "CLICK",
  "params": {
    "selector": "text::\"Benefits investigation (BI) support\""
  }
}
```

---

### Opção 2: Inspecionar Elemento Antes de Gravar

**Durante a gravação:**

1. **ANTES** de clicar no elemento:
   - F12 → Elements
   - Inspecione o elemento
   - Veja se tem ID, data-attributes, classes únicas

2. **USE console helper para forçar selector:**
   ```javascript
   // Em vez de clicar via UI
   // Use no console:
   window.flowCapture.sessionManager.startSession({
     type: 'click',
     target: document.querySelector('.specific-class'),
     forcedSelector: '.specific-class'  // Força usar este selector
   })
   ```

---

### Opção 3: Usar `text::` Sempre Que Possível

Para botões e links, o formato `text::"Texto Exato"` é mais robusto:

```json
{
  "type": "CLICK",
  "params": {
    "selector": "text::\"Benefits investigation (BI) support\""
  }
}
```

**Vantagens:**
- ✅ Funciona independente da estrutura DOM
- ✅ Não depende de classes/IDs
- ✅ Fácil de entender

**Desvantagens:**
- ❌ Texto deve ser exato
- ❌ Quebra se tradução mudar
- ❌ Não funciona para elementos sem texto

---

## 🔧 Exemplo: Corrigir Seu Workflow

### Passo 1: Identificar Seletores Ruins

No seu workflow, procure por:
```json
"selector": "li:nth-of-type(2)"           // ❌
"selector": "li"                          // ❌
"selector": "div[role=\"dialog\"]"        // ❌ (muito genérico)
"selector": "button[aria-label=\"Close\"]" // ⚠️ (ok, mas pode melhorar)
```

### Passo 2: Substituir por Seletores Melhores

Abra a página e inspecione cada elemento:

**Elemento: Botão "Benefits investigation"**
```html
<li class="access-item" data-type="benefit-investigation">
  <button class="accordion-button">
    Benefits investigation (BI) support
  </button>
</li>
```

**Melhor seletor:**
```json
// Opção 1: data-attribute
"selector": "li[data-type='benefit-investigation'] button"

// Opção 2: text
"selector": "text::\"Benefits investigation (BI) support\""

// Opção 3: classe específica
"selector": ".access-item.benefit-investigation .accordion-button"
```

---

## 🎯 Workflow Corrigido

### ❌ Original (Frágil):
```json
[
  {
    "type": "CLICK",
    "label": "Click on item",
    "params": { "selector": "li:nth-of-type(2)" }
  },
  {
    "type": "EXPAND",
    "params": { "container": "div[role=\"dialog\"]" }
  }
]
```

### ✅ Corrigido (Robusto):
```json
[
  {
    "type": "CLICK",
    "label": "Click on Benefits Investigation",
    "params": {
      "selector": "text::\"Benefits investigation (BI) support\""
    }
  },
  {
    "type": "EXPAND",
    "params": {
      "container": "#benefitInvestigationModal .modal-body"
    }
  }
]
```

---

## 🛠️ Ferramenta: Teste de Seletores

**Antes de editar o workflow, teste os seletores no console:**

```javascript
// Na página onde vai executar o workflow:

// Teste 1: Selector original
document.querySelector('li:nth-of-type(2)')
// Se retornar null → selector ruim!

// Teste 2: Selector melhorado
document.querySelector('.access-item[data-type="benefit"] button')
// Se retornar o elemento correto → bom!

// Teste 3: text selector (screenshot-tool format)
// Nota: text:: não funciona no querySelector, mas funciona no Puppeteer
```

---

## 📋 Checklist de Bons Seletores

Um seletor robusto deve:

- [ ] Ser único (seleciona apenas 1 elemento)
- [ ] Não depender de posição (`nth-child`, `nth-of-type`)
- [ ] Usar IDs, data-attributes ou classes específicas
- [ ] Ser estável (não muda entre reloads)
- [ ] Ser curto (max 3 níveis de profundidade)

**Ordem de preferência:**
1. ✅ ID: `#modal-benefits`
2. ✅ data-attribute: `[data-modal="benefits"]`
3. ✅ text::"Texto": `text::"Open Modal"`
4. ✅ Classe única: `.modal-benefits-content`
5. ⚠️ Combinação: `.modal .benefits-section button`
6. ❌ nth-child: `div:nth-child(2)` (evitar!)

---

## 🚀 Workflow de Correção

1. **Gere workflow com extensão** (aceite seletores frágeis por ora)
2. **Abra a página alvo** no browser
3. **Para cada CLICK/TYPE/EXPAND** no workflow:
   - Inspecione elemento na página
   - Identifique melhor seletor (ID, data-attr, text)
   - Substitua no JSON
4. **Teste seletores** no console
5. **Execute workflow** no screenshot-tool

---

## 💡 Dica: Crie um Script Helper

Para agilizar, crie um script que testa todos os seletores:

```javascript
// test-selectors.js
const workflow = [/* cole seu workflow */];

workflow.forEach((step, i) => {
  if (step.params?.selector) {
    const selector = step.params.selector;

    // Skip text selectors (não funcionam em querySelector)
    if (selector.startsWith('text::')) {
      console.log(`✅ Step ${i}: ${selector} (text selector, ok)`);
      return;
    }

    const found = document.querySelectorAll(selector);

    if (found.length === 0) {
      console.error(`❌ Step ${i}: ${selector} → NOT FOUND`);
    } else if (found.length === 1) {
      console.log(`✅ Step ${i}: ${selector} → OK (1 match)`);
    } else {
      console.warn(`⚠️ Step ${i}: ${selector} → ${found.length} matches (não único!)`);
    }
  }
});
```

**Uso:**
1. Abra página alvo
2. Console → cole o script
3. Veja quais seletores falharam
4. Corrija no JSON

---

## 🎓 Resumo

**Problema:** Extensão gera seletores frágeis (`li:nth-of-type(2)`)

**Solução:**
1. ✅ Editar JSON manualmente após gerar
2. ✅ Usar `text::"Texto"` para botões/links
3. ✅ Inspecionar elementos para achar IDs/data-attrs
4. ✅ Testar seletores no console antes de executar

**Objetivo:** Workflow que funciona quando executado! 🚀

---

**Próximo passo:** Depois de corrigir os seletores, você terá um workflow robusto que pode ser usado como exemplo de treinamento para a IA!
