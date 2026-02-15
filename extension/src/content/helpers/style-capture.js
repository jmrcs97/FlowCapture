/**
 * FlowCapture - Style Capture Helper
 *
 * Helper global que permite capturar mudanças de CSS manualmente
 * durante a gravação.
 *
 * USO:
 * 1. Abra console durante gravação
 * 2. Execute: captureStyle('.modal-body', 'height', 'auto')
 * 3. Ou: captureExpand('.modal-content')
 *
 * Isso adiciona um step especial que o compilador detecta e transforma
 * em nodes SET_STYLE ou EXPAND.
 */

/**
 * Captura mudança de estilo manualmente
 * @param {string} selector - Seletor CSS do elemento
 * @param {string} property - Propriedade CSS (height, width, overflow, etc.)
 * @param {string} value - Valor a ser aplicado
 * @param {string} priority - '' ou 'important'
 * @global
 */
window.captureStyle = function(selector, property, value, priority = 'important') {
    if (!window.flowCapture || !window.flowCapture.sessionManager) {
        console.error('FlowCapture: Recording not active');
        return;
    }

    const element = document.querySelector(selector);
    if (!element) {
        console.error(`FlowCapture: Element not found: ${selector}`);
        return;
    }

    // Cria evento customizado de mudança de estilo
    window.flowCapture.sessionManager.startSession({
        type: 'style_change',
        target: element,
        styleChanges: {
            selector,
            property,
            value,
            priority
        }
    });

    console.log(`✅ FlowCapture: Captured style change - ${selector} { ${property}: ${value} ${priority} }`);
};

/**
 * Captura expansão de elemento
 * @param {string} selector - Seletor do elemento a expandir
 * @param {string} mode - 'scroll-measure' | 'fit-content' | 'until-target-visible'
 * @global
 */
window.captureExpand = function(selector, mode = 'scroll-measure') {
    if (!window.flowCapture || !window.flowCapture.sessionManager) {
        console.error('FlowCapture: Recording not active');
        return;
    }

    const element = document.querySelector(selector);
    if (!element) {
        console.error(`FlowCapture: Element not found: ${selector}`);
        return;
    }

    window.flowCapture.sessionManager.startSession({
        type: 'expand',
        target: element,
        expandParams: {
            selector,
            mode,
            clearAncestorConstraints: true
        }
    });

    console.log(`✅ FlowCapture: Captured expand - ${selector} (mode: ${mode})`);
};

/**
 * Captura múltiplas mudanças de estilo de uma vez
 * @param {string} selector - Seletor do elemento
 * @param {Object} styles - Objeto com propriedade: valor
 * @param {string} priority - '' ou 'important'
 * @global
 */
window.captureStyles = function(selector, styles, priority = 'important') {
    if (!window.flowCapture || !window.flowCapture.sessionManager) {
        console.error('FlowCapture: Recording not active');
        return;
    }

    const element = document.querySelector(selector);
    if (!element) {
        console.error(`FlowCapture: Element not found: ${selector}`);
        return;
    }

    window.flowCapture.sessionManager.startSession({
        type: 'style_changes_batch',
        target: element,
        styleChanges: {
            selector,
            styles,
            priority
        }
    });

    const styleStr = Object.entries(styles)
        .map(([k, v]) => `${k}: ${v}`)
        .join('; ');

    console.log(`✅ FlowCapture: Captured ${Object.keys(styles).length} style changes - ${selector} { ${styleStr} }`);
};

/**
 * Marca um ponto de captura (screenshot placeholder)
 * @param {string} label - Label descritivo (ex: "Modal aberto", "Accordion expandido")
 * @global
 */
window.markCapture = function(label = 'Capture point') {
    if (!window.flowCapture || !window.flowCapture.sessionManager) {
        console.error('FlowCapture: Recording not active');
        return;
    }

    window.flowCapture.sessionManager.startSession({
        type: 'capture_point',
        target: document.body,
        captureLabel: label
    });

    console.log(`📸 FlowCapture: Marked capture point - "${label}"`);
    console.log('   → Edit screenshot params in JSON after download');
};

/**
 * Exemplo de uso:
 *
 * // Marcar ponto de captura
 * markCapture('Modal aberto')
 * markCapture('Tab 1 ativo')
 * markCapture('Accordion expandido')
 *
 * // Expandir modal
 * captureExpand('.modal-body', 'scroll-measure');
 *
 * // Setar height específico
 * captureStyle('.modal-body', 'height', '2000px', 'important');
 *
 * // Múltiplos estilos de uma vez
 * captureStyles('.modal-content', {
 *   height: 'auto',
 *   maxHeight: 'none',
 *   overflow: 'visible'
 * }, 'important');
 *
 * // Setar height do pai
 * captureStyle('.modal-dialog', 'height', '100%', 'important');
 */

// Log de helpers disponíveis
if (window.flowCapture) {
    console.log(
        '%cFlowCapture Helpers Available:',
        'color: #3b82f6; font-weight: bold; font-size: 14px;'
    );
    console.log('  📸 markCapture(label) - Mark screenshot point');
    console.log('  🎨 captureStyle(selector, property, value, priority)');
    console.log('  📐 captureExpand(selector, mode)');
    console.log('  🎨 captureStyles(selector, stylesObject, priority)');
    console.log('');
    console.log('Example workflow:');
    console.log('  captureExpand(".modal-body")');
    console.log('  captureStyle(".modal-dialog", "height", "100%")');
    console.log('  markCapture("Modal expanded") ← Screenshot here');
}
