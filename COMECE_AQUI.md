# ⚡ COMECE AQUI

## 🎯 Você Tem 2 Problemas

### ❌ Problema 1: Workflow sem SET_STYLE nodes

**Causa:** Editou CSS no DevTools (não funciona!)

**Solução:** Use console helpers durante gravação:
```javascript
captureStyle('.modal-dialog', 'height', '100%')
```

📖 **Ver:** [DEVTOOLS_VS_CONSOLE.md](DEVTOOLS_VS_CONSOLE.md)

---

### ❌ Problema 2: Seletores frágeis (erro ao executar)

**Causa:** Extensão gera `li:nth-of-type(2)` (frágil)

**Solução:** Edite JSON após gerar:
```json
// ❌ Antes
{ "selector": "li:nth-of-type(2)" }

// ✅ Depois
{ "selector": "text::\"Benefits Investigation\"" }
```

📖 **Ver:** [MELHORAR_SELETORES.md](MELHORAR_SELETORES.md)

---

## 🚀 Teste Agora (2 minutos)

```
1. chrome://extensions → FlowCapture → ⟳ Reload

2. Vá para google.com

3. Start Recording

4. F12 → Console → Digite:
   captureStyle('body', 'background', 'red')

5. Você deve ver:
   ✅ FlowCapture: Captured style change

6. Stop → Download → Workflow (IR)

7. Abra workflow_ir.json → Procure:
   { "type": "SET_STYLE", ... }
```

✅ **Se aparecer** → Funciona! Agora use com seus modais.

❌ **Se NÃO aparecer** → Ver [TESTE_RAPIDO.md](TESTE_RAPIDO.md)

---

## 📚 Documentação

| Arquivo | Quando Usar |
|---------|-------------|
| **[EXEMPLO_PRATICO.md](EXEMPLO_PRATICO.md)** | Teste completo passo-a-passo |
| **[DEVTOOLS_VS_CONSOLE.md](DEVTOOLS_VS_CONSOLE.md)** | Entender diferença crítica |
| **[GUIA_CONSOLE_HELPERS.md](GUIA_CONSOLE_HELPERS.md)** | Referência dos comandos |
| **[MELHORAR_SELETORES.md](MELHORAR_SELETORES.md)** | Corrigir seletores frágeis |
| **[README_COMPLETO.md](README_COMPLETO.md)** | Documentação completa |

---

## ✅ Workflow Correto

```javascript
// 1. Start Recording

// 2. Actions via UI (click, scroll)

// 3. ⚡ Console (F12):
captureExpand('.modal-body', 'scroll-measure')
captureStyle('.modal-dialog', 'height', '100%')
captureStyles('.modal-content', {
  maxHeight: 'none',
  overflow: 'visible'
})

// 4. Checkpoint + Stop + Download
```

**Resultado:**
```json
[
  { "type": "CLICK" },
  { "type": "EXPAND" },     // ✅
  { "type": "SET_STYLE" },  // ✅
  { "type": "SET_STYLE" },  // ✅
  { "type": "SET_STYLE" },  // ✅
  { "type": "SCREENSHOT" }
]
```

---

## 🎓 Para Treinar IA

Workflow gerado = Exemplo perfeito para mostrar à IA:
- Como expandir modais
- Quando usar EXPAND vs SET_STYLE
- Sequência correta de nodes

Ver: [GUIA_TREINAMENTO_IA.md](GUIA_TREINAMENTO_IA.md)

---

**Pronto para começar! 🚀**
