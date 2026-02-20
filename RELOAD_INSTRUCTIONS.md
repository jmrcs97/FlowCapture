# 🔄 Como Recarregar a Extensão FlowCapture

## ❌ Erro Anterior

```
Failed to start: Could not establish connection. Receiving end does not exist.
```

**Causa:** O `manifest.json` não incluía `src/content/services/*.js` nos `web_accessible_resources`, então o navegador não conseguia carregar os módulos ShortcutMatcher e ExpansionManager.

**Correção:** Adicionado `"src/content/services/*.js"` ao manifest.

---

## ✅ Passos para Recarregar

### 1. Abrir Página de Extensões

```
1. Abra o Chrome
2. Digite na barra de endereços: chrome://extensions
3. Pressione Enter
```

### 2. Recarregar FlowCapture

**Opção A: Botão Recarregar**
```
1. Encontre "FlowCapture Intent Recorder" na lista
2. Clique no ícone de recarregar (⟳) no card da extensão
```

**Opção B: Desabilitar/Reabilitar**
```
1. Encontre "FlowCapture Intent Recorder"
2. Clique no toggle para DESABILITAR
3. Espere 2 segundos
4. Clique no toggle para REABILITAR
```

### 3. Verificar que Funcionou

**Abra o Console do DevTools:**
```
1. Vá para qualquer página web
2. Pressione F12 para abrir DevTools
3. Vá para a aba "Console"
4. Procure por: "FlowCapture: Initialized successfully" ✅
```

**Se ver esse log → Extensão carregou com sucesso! 🎉**

**Se ainda ver erro:**
1. Abra chrome://extensions
2. Clique em "Erros" (se aparecer) na extensão FlowCapture
3. Copie o erro completo e mostre para análise

---

## 🧪 Testar Funcionalidade

Depois de recarregar com sucesso:

### Teste 1: Abrir Popup

```
1. Clique no ícone da extensão FlowCapture (barra de ferramentas)
2. Deve abrir o popup normalmente
3. Clique em "Start Recording"
4. Deve aparecer overlay na página
```

### Teste 2: Visual Feedback (Novo!)

```
1. Com gravação ativa, pressione Ctrl+Shift+C (ou seu atalho)
2. Deve aparecer ícone flutuante 📸 no topo da página
3. O ícone deve desaparecer após 2 segundos com animação
```

### Teste 3: Expand Element

```
1. Com gravação ativa, pressione Ctrl+Shift+E (ou seu atalho)
2. Aponte para um elemento da página
3. Deve aparecer outline verde/amarelo no elemento
4. Ícone 📐 deve aparecer no topo
```

### Teste 4: Selector Engine

```
1. Abra C:\Users\João\Desktop\FlowCapture\extension\test-selector-engine.html
2. Clique em qualquer elemento verde
3. Veja no console o seletor gerado
4. Deve ser XPath/Aria (não nth-of-type)
```

---

## 📊 Checklist de Validação

Após recarregar, confirme:

- [ ] Console mostra "FlowCapture: Initialized successfully"
- [ ] Popup abre sem erros
- [ ] "Start Recording" funciona
- [ ] Overlay aparece na página
- [ ] Atalho de captura (Ctrl+Shift+C) mostra ícone 📸
- [ ] Atalho de expand (Ctrl+Shift+E) mostra ícone 📐
- [ ] Seletores são XPath/Aria (teste com test-selector-engine.html)
- [ ] Nenhum erro no console do DevTools

---

## 🆘 Troubleshooting

### Erro: "Não aparece nada no console"

**Possível causa:** Content script não injetou

**Solução:**
1. Recarregue a PÁGINA (F5) depois de recarregar a extensão
2. Abra uma NOVA aba e vá para qualquer site
3. Verifique o console novamente

### Erro: "Módulo não encontrado"

**Possível causa:** Caminho de import incorreto

**Solução:**
1. Abra chrome://extensions
2. Ative "Modo do desenvolvedor" (toggle no topo direito)
3. Clique em "Erros" na extensão
4. Veja qual módulo está faltando
5. Informe o erro completo

### Erro: "SyntaxError: Unexpected token"

**Possível causa:** Arquivo corrompido ou sintaxe inválida

**Solução:**
1. Verifique que todos os arquivos .js são válidos
2. Execute: `node -c arquivo.js` para cada arquivo
3. Se houver erro de sintaxe, corrija

### Erro: "Cannot read property X of undefined"

**Possível causa:** Módulo não exportou corretamente

**Solução:**
1. Verifique que cada módulo tem `export class X` ou `export const X`
2. Verifique que content.js está importando corretamente
3. Compare os imports em content.js com os exports nos módulos

---

## 📁 Arquivos Modificados

| Arquivo | O Que Mudou |
|---------|-------------|
| `manifest.json` | Adicionado `"src/content/services/*.js"` |
| `content.js` | Refatorado (892 → 618 linhas) |
| `selector-engine.js` | Integrado INTERACTIVE_ELEMENTS |

**Novos arquivos criados pelo agente:**
- `src/content/core/session-manager.js`
- `src/content/core/mutation-tracker.js`
- `src/content/core/state-manager.js`
- `src/shared/constants.js`

**Arquivos de serviço (já existiam, agora integrados):**
- `src/content/services/shortcut-matcher.js`
- `src/content/services/expansion-manager.js`
- `src/content/ui/visual-feedback.js`
- `src/shared/interactive-elements.js`

---

## ✅ Resultado Esperado

Depois de recarregar e validar, você terá:

1. ✅ **Extensão funcionando** sem erros
2. ✅ **Código 31% mais limpo** (892 → 618 linhas)
3. ✅ **Arquitetura modular** com separação de responsabilidades
4. ✅ **Visual feedback** funcionando (ícones + outlines)
5. ✅ **Selector Engine v3** com seletores robustos
6. ✅ **Tudo testado** e pronto para gravar workflows

---

## 🎯 Próximos Passos (Depois de Validar)

1. ✅ Validar extensão funcionando
2. 🧪 Testar selector engine (test-selector-engine.html)
3. 🎬 Re-gravar workflow com novos seletores
4. ✅ Testar workflow em múltiplos modais
5. 🚀 Deploy

---

**Tempo estimado para recarregar e validar:** 5-10 minutos

Se tudo funcionar, você está pronto para re-gravar o workflow e resolver o problema dos modais! 🎉
