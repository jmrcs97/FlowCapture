/**
 * FlowCapture - Workflow IR Compiler
 * Converte steps capturados → formato IR do screenshot-tool
 *
 * Traduz eventos de interação em workflow nodes compatíveis com
 * DOCUMENTO_TECNICO_WORKFLOW_IR_BASED.md
 */

export class WorkflowCompiler {
    constructor(options = {}) {
        this.nodeIdCounter = 0;
        this.screenshotCounter = 0;
        this.workflow = [];
        this.screenshotMode = options.screenshotMode || 'dynamic';
        this.preScreenshotDelay = options.preScreenshotDelay ?? 1500;
    }

    /**
     * Compila array de steps em workflow IR
     * @param {string} startUrl - URL inicial
     * @param {Array} capturedSteps - Steps capturados pela extensão
     * @returns {Array} Workflow no formato IR
     */
    compile(startUrl, capturedSteps) {
        this.nodeIdCounter = 0;
        this.screenshotCounter = 0;
        this.loopCounter = 0;
        this.workflow = [];

        // 1. Node START
        this._addStartNode(startUrl);

        // 2. WAIT inicial para carregamento
        this._addWaitNode('Wait for initial page load', {
            condition: 'fixed-time',
            timeoutMs: 2000
        });

        // 3. Processa cada step capturado
        capturedSteps.forEach((step, index) => {
            this._processStep(step, index, capturedSteps);
        });

        // 4. Optimize: detect repetitive CLICK→SCREENSHOT patterns → LOOP
        this.workflow = this._optimizeRepetitivePatterns(this.workflow);

        // 5. Node OUTPUT final
        this._addOutputNode();

        // 6. Validate compiled workflow
        this._validateWorkflow(this.workflow);

        return this.workflow;
    }

    /**
     * Processa um step individual
     * @private
     */
    /**
     * Compute how long to wait before a screenshot step, based on:
     * - Visual settling time of the previous step (measured by LayoutStabilizer)
     * - Actual time the user paused between interactions
     * For capture_point/checkpoint: 90% of real delta (user waited for animation)
     * For other triggers: 60% of real delta (navigational pauses)
     * @private
     */
    _computeInterStepWait(step, index, allSteps) {
        if (index === 0) return 0;
        const prev = allSteps[index - 1];
        const prevTs = prev.trigger?.timestamp || 0;
        const currTs = step.trigger?.timestamp || 0;
        const interStepMs = currTs - prevTs;

        // Minimum = measured settling time of the previous step
        const prevSettlingMs = prev.visual_settling?.total_ms || 0;

        // For capture points, the user intentionally waited for the page to be ready.
        // Preserve 90% of their actual wait time so animations complete during playback.
        // For other events (clicks, scrolls), 60% is enough since those are navigational pauses.
        const isCaptureWait = step.trigger?.type === 'capture_point' || step.trigger?.type === 'checkpoint';
        const scaleFactor = isCaptureWait ? 0.9 : 0.6;
        const cap = isCaptureWait ? 8000 : 4000;
        const scaledPause = interStepMs > 800 ? Math.min(Math.round(interStepMs * scaleFactor), cap) : 0;

        const wait = Math.max(prevSettlingMs, scaledPause);
        return wait > 250 ? Math.round(wait) : 0;
    }

    _processStep(step, index, allSteps) {
        const triggerType = step.trigger?.type;

        // Add timing-based wait BEFORE screenshot capture points:
        // This handles the gap between the last interaction (e.g. click) and when
        // the user actually marked the screenshot — preserving the page's loaded state.
        // Only for explicit capture_point/checkpoint — not for click/scroll (those add their own waits).
        if (index > 0 && (triggerType === 'capture_point' || triggerType === 'checkpoint')) {
            const waitMs = this._computeInterStepWait(step, index, allSteps);
            if (waitMs > 0) {
                this._addWaitNode(`Wait for state to settle`, { condition: 'fixed-time', timeoutMs: waitMs });
            }
        }

        // Skip focus events if previous step was click on the same element (redundant)
        if (triggerType === 'focus' && index > 0) {
            const prev = allSteps[index - 1];
            if (prev.trigger?.type === 'click' && prev.trigger?.selector === step.trigger?.selector) {
                return;
            }
        }

        // Skip scroll events if next step is also scroll (keep last = final position)
        if (triggerType === 'scroll' && index < allSteps.length - 1) {
            const next = allSteps[index + 1];
            if (next.trigger?.type === 'scroll') {
                // With scroll-to mode, the last scroll has the final absolute position
                return;
            }
        }

        switch (triggerType) {
            case 'click':
                this._handleClick(step);
                break;

            case 'input':
            case 'input_change':
                this._handleInput(step);
                break;

            case 'scroll':
                this._handleScroll(step);
                break;

            case 'submit':
                this._handleSubmit(step);
                break;

            case 'keydown':
                this._handleKeydown(step);
                break;

            case 'focus':
                this._handleFocus(step);
                break;

            case 'checkpoint':
                this._handleCheckpoint(step);
                break;

            case 'style_change':
                this._handleStyleChange(step);
                break;

            case 'expand':
                this._handleExpandEvent(step);
                break;

            case 'style_changes_batch':
                this._handleStyleChangesBatch(step);
                break;

            case 'capture_point':
                this._handleCapturePoint(step);
                break;

            default:
                console.warn(`WorkflowCompiler: Unknown trigger type "${triggerType}"`);
        }

        // Only detect style changes for explicit style/expand events
        if (triggerType === 'style_change' || triggerType === 'style_changes_batch' || triggerType === 'expand') {
            this._detectStyleChanges(step);
        }

        // WAIT only after navigation-triggering events (submit, click that navigates)
        if (triggerType === 'submit') {
            this._addWaitForStability(step);
        }
    }

    _addStartNode(url) {
        this.workflow.push({
            type: 'START',
            label: 'Start',
            params: { url },
            connections: [{ to: 1, condition: 'success' }]
        });
        this.nodeIdCounter++;
    }

    _addWaitNode(label, params) {
        const currentIndex = this.workflow.length;
        this.workflow.push({
            type: 'WAIT',
            label,
            params,
            connections: [{ to: currentIndex + 1, condition: 'success' }]
        });
        this.nodeIdCounter++;
    }

    _handleClick(step) {
        const selector = step.trigger?.selector;
        if (!selector) return;
        const currentIndex = this.workflow.length;

        const metadata = step.trigger.metadata || {};
        const elementText = metadata.text || metadata.ariaLabel || '';

        const params = { selector };

        // Playwright semantic locator hints — used by /api/replay for robust role-based clicks
        // elementRole: the interactive element type (button, a, input, etc.)
        // elementName: the accessible name (visible text or aria-label)
        if (metadata.tagName) params.elementRole = metadata.tagName.toLowerCase();
        if (elementText) params.elementName = elementText;
        if (metadata.ariaLabel) params.ariaLabel = metadata.ariaLabel;

        // Add fallback selectors for robustness
        this._addFallbacks(params, step);

        if (step.trigger.button !== undefined) {
            params.button = step.trigger.button === 0 ? 'left' :
                step.trigger.button === 1 ? 'middle' : 'right';
        }

        if (step.effects?.navigation_detected || step.effects?.url_changed) {
            params.expectNavigation = true;
        }

        this.workflow.push({
            type: 'CLICK',
            label: `Click on ${this._getReadableSelector(selector, elementText)}`,
            params,
            connections: [{ to: currentIndex + 1, condition: 'success' }]
        });
        this.nodeIdCounter++;

        // Add WAIT for visual settling — accordion opens, modal appears, animation plays, etc.
        // Uses the measured settling time from the layout stabilizer (recorded by the extension).
        const settlingMs = step.visual_settling?.total_ms || 0;
        const hasVisualChange = this._hasSignificantVisualChanges(step);
        if (hasVisualChange || settlingMs > 150) {
            const waitMs = Math.min(Math.max(settlingMs, 300), 2500);
            this._addWaitNode('Wait for DOM to settle', { condition: 'fixed-time', timeoutMs: waitMs });
        }
    }

    _handleInput(step) {
        const selector = step.trigger?.selector;
        if (!selector) return;
        const value = step.trigger.value || '';
        const currentIndex = this.workflow.length;

        const metadata = step.trigger.metadata || {};
        const fieldName = metadata.name || metadata.placeholder || 'field';

        const params = {
            selector,
            text: value,
            clearFirst: true,
            delayMs: 50
        };
        this._addFallbacks(params, step);

        this.workflow.push({
            type: 'TYPE',
            label: `Type in ${fieldName}`,
            params,
            connections: [{ to: currentIndex + 1, condition: 'success' }]
        });
        this.nodeIdCounter++;
    }

    _handleScroll(step) {
        const scrollData = step.trigger.scroll;
        if (!scrollData) return;

        const currentIndex = this.workflow.length;
        const toY = scrollData.to?.y || 0;
        const toX = scrollData.to?.x || 0;

        // No meaningful scroll
        if (toY === 0 && toX === 0) return;

        const params = {
            mode: 'scroll-to',
            x: toX,
            y: toY,
            behavior: 'auto'
        };

        this.workflow.push({
            type: 'SCROLL',
            label: `Scroll to Y=${toY}px`,
            params,
            connections: [{ to: currentIndex + 1, condition: 'success' }]
        });
        this.nodeIdCounter++;
    }

    _handleSubmit(step) {
        const selector = step.trigger?.selector;
        if (!selector) return;
        const currentIndex = this.workflow.length;

        this.workflow.push({
            type: 'CLICK',
            label: 'Submit form',
            params: {
                selector: selector + ' button[type="submit"], ' + selector + ' input[type="submit"]',
                expectNavigation: true
            },
            connections: [{ to: currentIndex + 1, condition: 'success' }]
        });
        this.nodeIdCounter++;

        const navWaitIndex = this.workflow.length;
        this.workflow.push({
            type: 'WAIT_FOR_NAVIGATION',
            label: 'Wait for form submission',
            params: {
                waitUntil: 'networkidle2',
                timeoutMs: 15000
            },
            connections: [{ to: navWaitIndex + 1, condition: 'success' }]
        });
        this.nodeIdCounter++;
    }

    _handleKeydown(step) {
        const key = step.trigger?.key;
        if (!key) return;

        if (key === 'Enter') {
            const selector = step.trigger?.selector;
            if (!selector) return;
            const currentIndex = this.workflow.length;

            this.workflow.push({
                type: 'CLICK',
                label: `Press Enter on ${this._getReadableSelector(selector)}`,
                params: { selector },
                connections: [{ to: currentIndex + 1, condition: 'success' }]
            });
            this.nodeIdCounter++;
        } else if (key === 'Escape') {
            this._addPrint(`Pressed Escape key`, 'info');
        }
    }

    _handleFocus(step) {
        const selector = step.trigger?.selector;
        if (!selector) return;
        const currentIndex = this.workflow.length;

        const metadata = step.trigger.metadata || {};
        const fieldName = metadata.name || metadata.placeholder || 'element';

        const params = { selector };
        this._addFallbacks(params, step);

        this.workflow.push({
            type: 'CLICK',
            label: `Focus on ${fieldName}`,
            params,
            connections: [{ to: currentIndex + 1, condition: 'success' }]
        });
        this.nodeIdCounter++;
    }

    _handleCheckpoint(step) {
        this.screenshotCounter++;

        // Pre-screenshot delay: ensures animations/transitions finish before capture
        if (this.preScreenshotDelay > 0) {
            this._addWaitNode('Wait before screenshot', {
                condition: 'fixed-time',
                timeoutMs: this.preScreenshotDelay
            });
        }

        const currentIndex = this.workflow.length;
        this.workflow.push({
            type: 'SCREENSHOT',
            label: 'Checkpoint screenshot',
            params: {
                captureMode: 'page',
                format: 'png',
                fullPage: true,
                useDynamicHeight: true,
                dynamicHeightDelay: 1,
                viewportWidth: step.trigger.viewport?.width || 1440,
                filename: `checkpoint_${String(this.screenshotCounter).padStart(3, '0')}`
            },
            connections: [{ to: currentIndex + 1, condition: 'success' }]
        });
        this.nodeIdCounter++;
    }

    _addWaitForStability(step) {
        const settling = step.visual_settling || {};
        const waitTime = Math.min(settling.frames_observed * 16 || 500, 2000);

        const currentIndex = this.workflow.length;

        this.workflow.push({
            type: 'WAIT',
            label: 'Wait for visual stability',
            params: {
                condition: 'fixed-time',
                timeoutMs: waitTime
            },
            connections: [{ to: currentIndex + 1, condition: 'success' }]
        });
        this.nodeIdCounter++;
    }

    _addPrint(message, severity = 'info') {
        const currentIndex = this.workflow.length;

        this.workflow.push({
            type: 'PRINT',
            label: message,
            params: { message, severity },
            connections: [{ to: currentIndex + 1, condition: 'success' }]
        });
        this.nodeIdCounter++;
    }

    _addOutputNode() {
        this.workflow.push({
            type: 'OUTPUT',
            label: 'Save results',
            params: {
                folderName: 'flow-capture-output',
                zip: false
            }
        });
        this.nodeIdCounter++;
    }

    _hasSignificantVisualChanges(step) {
        const effects = step.effects || {};
        const settling = step.visual_settling || {};

        return (
            (effects.new_elements && effects.new_elements.length > 0) ||
            settling.max_layout_shift > 0.1 ||
            (effects.body_class_changes && effects.body_class_changes.length > 0) ||
            settling.frames_observed > 2
        );
    }

    _getReadableSelector(selector, text = '') {
        if (text && text.length > 0) {
            return `"${text.substring(0, 30)}"`;
        }

        if (!selector) return 'element';

        if (selector.startsWith('#')) {
            return selector.split(' ')[0];
        }

        // XPath: //tag[@aria-label='Close'] → "Close"
        if (selector.startsWith('//')) {
            const ariaMatch = selector.match(/@aria-label=['"](.*?)['"]/);
            if (ariaMatch) return `"${ariaMatch[1].substring(0, 30)}"`;
            const textMatch = selector.match(/text\(\)=['"](.*?)['"]/);
            if (textMatch) return `"${textMatch[1].substring(0, 30)}"`;
            const nameMatch = selector.match(/@(?:name|placeholder)=['"](.*?)['"]/);
            if (nameMatch) return `${nameMatch[1].substring(0, 30)}`;
            // Extract tag from //tag[...]
            const tagMatch = selector.match(/^\/\/(\w+)/);
            return tagMatch ? tagMatch[1] : 'element';
        }

        // aria/Label → "Label"
        if (selector.startsWith('aria/')) {
            return `"${selector.slice(5).substring(0, 30)}"`;
        }

        if (selector.includes('text::"')) {
            const match = selector.match(/text::"([^"]+)"/);
            return match ? `"${match[1]}"` : 'element';
        }

        // img[alt="..."] → "alt text"
        if (selector.includes('img[alt="')) {
            const match = selector.match(/img\[alt="([^"]+)"/);
            return match ? `img "${match[1].substring(0, 25)}"` : 'image';
        }

        const parts = selector.split(' ');
        const lastPart = parts[parts.length - 1];
        // Clean up selectors for readability
        return lastPart.replace(/[:>\[\]="]/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 30) || 'element';
    }

    /**
     * Add fallback selectors to params if available
     * @param {Object} params - Node params
     * @param {Object} step - Captured step
     * @private
     */
    _addFallbacks(params, step) {
        const fallbacks = step.trigger?.selectorFallbacks;
        if (fallbacks && fallbacks.length > 0) {
            params.selectorFallbacks = fallbacks;
        }
    }

    /**
     * Detecta mudanças de estilo e gera nodes SET_STYLE ou EXPAND
     * @param {Object} step
     * @private
     */
    _detectStyleChanges(step) {
        // Only process actual style/expand events - never auto-infer EXPAND
        // EXPAND nodes are only created from explicit 'expand' events via _handleExpandEvent
        const settling = step.visual_settling || {};

        if (settling.max_layout_shift > 200) {
            this._addPrint(
                `Large layout shift detected (${settling.max_layout_shift}px). ` +
                `Consider adding EXPAND or SET_STYLE nodes manually.`,
                'info'
            );
        }
    }

    /**
     * Adiciona node EXPAND para elemento
     * @param {string} selector
     * @param {string} reason
     * @private
     */
    _addExpandForElement(selector, reason = '') {
        const currentIndex = this.workflow.length;

        this.workflow.push({
            type: 'EXPAND',
            label: `Expand ${this._getReadableSelector(selector)}`,
            params: {
                mode: 'scroll-measure',
                container: selector,
                clearAncestorConstraints: true,
                scrollStep: 100,
                scrollDelay: 200,
                keepScrollbar: true,
                resetScroll: true,
                useHeightOffset: true,
                heightOffset: -10
            },
            connections: [{ to: currentIndex + 1, condition: 'success' }]
        });
        this.nodeIdCounter++;

        if (reason) {
            console.log(`WorkflowCompiler: Added EXPAND for ${selector} - ${reason}`);
        }
    }

    /**
     * Adiciona node SET_STYLE para elemento
     * @param {string} selector
     * @param {string} property
     * @param {string} value
     * @param {string} priority
     * @private
     */
    _addSetStyle(selector, property, value, priority = 'important') {
        const currentIndex = this.workflow.length;

        this.workflow.push({
            type: 'SET_STYLE',
            label: `Set ${property} on ${this._getReadableSelector(selector)}`,
            params: {
                selector,
                property,
                value,
                priority
            },
            connections: [{ to: currentIndex + 1, condition: 'success' }]
        });
        this.nodeIdCounter++;
    }

    /**
     * Processa evento de mudança de estilo (captureStyle)
     * @param {Object} step
     * @private
     */
    _handleStyleChange(step) {
        const styleChange = step.trigger.styleChange;
        if (!styleChange?.selector || !styleChange?.property || styleChange?.value === undefined) return;

        this._addSetStyle(
            styleChange.selector,
            styleChange.property,
            styleChange.value,
            styleChange.priority
        );
    }

    /**
     * Processa evento de expansão (captureExpand)
     * @param {Object} step
     * @private
     */
    _handleExpandEvent(step) {
        const expandParams = step.trigger.expandParams;
        if (!expandParams) return;

        const currentIndex = this.workflow.length;

        this.workflow.push({
            type: 'EXPAND',
            label: `Expand ${this._getReadableSelector(expandParams.selector)}`,
            params: {
                mode: expandParams.mode || 'scroll-measure',
                container: expandParams.selector,
                value: expandParams.value,
                clearAncestorConstraints: expandParams.clearAncestorConstraints !== false,
                scrollStep: 100,
                scrollDelay: 200,
                keepScrollbar: true,
                resetScroll: true,
                useHeightOffset: true,
                heightOffset: -10
            },
            connections: [{ to: currentIndex + 1, condition: 'success' }]
        });
        this.nodeIdCounter++;
    }

    /**
     * Processa lote de mudanças de estilo (captureStyles)
     * @param {Object} step
     * @private
     */
    _handleStyleChangesBatch(step) {
        const styleChangesBatch = step.trigger.styleChangesBatch;
        if (!styleChangesBatch?.selector || !styleChangesBatch.styles || typeof styleChangesBatch.styles !== 'object') return;

        const { selector, styles, priority } = styleChangesBatch;

        // Adiciona um node SET_STYLE para cada propriedade
        Object.entries(styles).forEach(([property, value]) => {
            this._addSetStyle(selector, property, value, priority);
        });
    }

    /**
     * Processa ponto de captura manual (markCapture)
     * Gera node SCREENSHOT com parâmetros editáveis no JSON
     * @param {Object} step
     * @private
     */
    _handleCapturePoint(step) {
        const label = step.trigger.captureLabel || 'Capture screenshot';
        this.screenshotCounter++;

        // Pre-screenshot delay: ensures animations/transitions finish before capture
        if (this.preScreenshotDelay > 0) {
            this._addWaitNode('Wait before screenshot', {
                condition: 'fixed-time',
                timeoutMs: this.preScreenshotDelay
            });
        }

        const currentIndex = this.workflow.length;
        const sanitized = label.replace(/[<>:"/\\|?*\s]+/g, '_').substring(0, 40);
        const params = {
            ...this._screenshotModeParams(),
            filename: `${String(this.screenshotCounter).padStart(3, '0')}_${sanitized}`
        };

        this.workflow.push({
            type: 'SCREENSHOT',
            label: label,
            params,
            connections: [{ to: currentIndex + 1, condition: 'success' }]
        });
        this.nodeIdCounter++;
    }

    /**
     * Shared screenshot params based on screenshotMode setting
     * @returns {Object}
     * @private
     */
    _screenshotModeParams() {
        const params = {
            captureMode: 'page',
            format: 'png',
            viewportWidth: 1440
        };
        switch (this.screenshotMode) {
            case 'dynamic':
                params.fullPage = false;
                params.useDynamicHeight = true;
                params.dynamicHeightDelay = 1;
                break;
            case 'fullpage':
                params.fullPage = true;
                params.useDynamicHeight = false;
                break;
            case 'viewport':
                params.fullPage = false;
                params.useDynamicHeight = false;
                break;
        }
        return params;
    }

    // ─── Loop Pattern Optimization ──────────────────────────

    /**
     * Post-compilation pass: detect consecutive CLICK→SCREENSHOT pairs
     * targeting sibling elements and replace with ELEMENT_SCAN + FOR_EACH
     * @param {Array} workflow - Compiled workflow nodes
     * @returns {Array} Optimized workflow
     * @private
     */
    _optimizeRepetitivePatterns(workflow) {
        const groups = this._findClickCaptureGroups(workflow);
        if (groups.length === 0) return workflow;

        const result = [];
        const skipSet = new Set();
        const groupStarts = new Map();

        for (const group of groups) {
            groupStarts.set(group.startIdx, group);
            for (let i = group.startIdx; i <= group.endIdx; i++) {
                skipSet.add(i);
            }
        }

        for (let i = 0; i < workflow.length; i++) {
            if (skipSet.has(i)) {
                const group = groupStarts.get(i);
                if (group) {
                    this.loopCounter++;
                    const scanId = `scan-loop-${this.loopCounter}`;
                    result.push(this._buildScanNode(group, scanId));
                    result.push(this._buildLoopNode(group, scanId));
                }
                continue;
            }
            result.push({ ...workflow[i] });
        }

        // Reindex connections sequentially
        for (let i = 0; i < result.length; i++) {
            if (result[i].connections) {
                result[i].connections = [{ to: i + 1, condition: 'success' }];
            }
        }

        return result;
    }

    /**
     * Find groups of consecutive CLICK→SCREENSHOT pairs where CLICKs target siblings
     * @private
     */
    _findClickCaptureGroups(workflow) {
        const groups = [];
        let i = 0;

        // Skip all consecutive WAIT nodes starting at idx, return index of first non-WAIT node
        const skipWaits = (idx) => {
            while (workflow[idx]?.type === 'WAIT') idx++;
            return idx;
        };

        while (i < workflow.length) {
            // Look for CLICK followed by SCREENSHOT (with any number of WAITs in between)
            if (workflow[i].type !== 'CLICK') {
                i++;
                continue;
            }
            const firstSsIdx = skipWaits(i + 1);
            if (workflow[firstSsIdx]?.type !== 'SCREENSHOT') {
                i++;
                continue;
            }

            // Collect consecutive CLICK → (WAIT*) → SCREENSHOT pairs
            const pairs = [];
            let j = i;
            while (j < workflow.length) {
                if (workflow[j].type !== 'CLICK') break;
                const ssIdx = skipWaits(j + 1);
                if (workflow[ssIdx]?.type !== 'SCREENSHOT') break;

                pairs.push({
                    clickIdx: j,
                    screenshotIdx: ssIdx,
                    clickNode: workflow[j],
                    screenshotNode: workflow[ssIdx]
                });
                j = ssIdx + 1;
            }

            // Need at least 2 consecutive pairs to form a loop
            if (pairs.length >= 2) {
                const loopInfo = this._analyzeSiblings(pairs);
                if (loopInfo) {
                    groups.push({
                        startIdx: pairs[0].clickIdx,
                        endIdx: pairs[pairs.length - 1].screenshotIdx,
                        itemCount: pairs.length,
                        pairs,
                        ...loopInfo
                    });
                    i = pairs[pairs.length - 1].screenshotIdx + 1;
                    continue;
                }
            }

            i++;
        }

        return groups;
    }

    /**
     * Check if CLICKs in a group target sibling elements
     * Uses selector skeleton matching (primary + fallbacks)
     * @private
     */
    _analyzeSiblings(pairs) {
        // Get all selectors (primary + fallbacks) for each click
        const allSkeletons = pairs.map(p => {
            const click = p.clickNode;
            const sels = [click.params.selector, ...(click.params.selectorFallbacks || [])];
            return sels
                .map(sel => ({ original: sel, skeleton: this._selectorSkeleton(sel) }))
                .filter(s => s.skeleton);
        });

        if (allSkeletons.length === 0 || allSkeletons[0].length === 0) return null;

        // Find a skeleton that matches across ALL clicks
        for (const { skeleton } of allSkeletons[0]) {
            let allMatch = true;

            for (let k = 1; k < allSkeletons.length; k++) {
                const match = allSkeletons[k].find(s => s.skeleton === skeleton);
                if (!match) {
                    allMatch = false;
                    break;
                }
            }

            if (allMatch) {
                const info = this._extractLoopInfo(skeleton);
                if (info) return info;
            }
        }

        return null;
    }

    /**
     * Generate selector skeleton by replacing varying parts with placeholders
     * CSS: nth-of-type(N) → nth-of-type(*)
     * XPath: quoted values → *
     * @private
     */
    _selectorSkeleton(selector) {
        if (!selector) return null;

        // CSS selectors: replace nth indices
        if (!selector.startsWith('//') && !selector.startsWith('text::') && !selector.startsWith('aria/')) {
            const skeleton = selector
                .replace(/:nth-of-type\(\d+\)/g, ':nth-of-type(*)')
                .replace(/:nth-child\(\d+\)/g, ':nth-child(*)');
            // Only useful if it had a varying index
            return skeleton !== selector ? skeleton : null;
        }

        // XPath: only generate skeleton for POSITIONAL predicates like [1], [2], [3]
        // Text/value predicates (normalize-space, @aria-label, @name) are unique identifiers —
        // they cannot be used for positional iteration and must NOT trigger loop optimization.
        if (selector.startsWith('//')) {
            if (!/\[\d+\]/.test(selector)) return null; // no positional index = not a loop candidate
            const skeleton = selector.replace(/\[\d+\]/g, '[*]');
            return skeleton !== selector ? skeleton : null;
        }

        // text:: selectors are always unique identifiers — never loop candidates
        if (selector.startsWith('text::')) {
            return null;
        }

        return null;
    }

    /**
     * Extract rootSelector, itemSelector, clickPath from a CSS skeleton
     * e.g. "#container > div.tabs:nth-of-type(*) > div.box > p.title"
     *   → root: "#container", item: "div.tabs", clickPath: "div.box > p.title"
     * @private
     */
    _extractLoopInfo(skeleton) {
        // CSS path with nth-of-type(*)
        if (!skeleton.startsWith('//') && skeleton.includes(':nth-of-type(*)')) {
            const parts = skeleton.split(/\s*>\s*/);
            const varyingIdx = parts.findIndex(p => p.includes(':nth-of-type(*)'));
            if (varyingIdx < 0) return null;

            const rootParts = parts.slice(0, varyingIdx);
            const itemPart = parts[varyingIdx]
                .replace(/:nth-of-type\(\*\)/, '')
                .replace(/:nth-child\(\*\)/, '')
                .trim();
            const clickPathParts = parts.slice(varyingIdx + 1);

            // Reject bare tag names (e.g. "div", "span") - too broad for ELEMENT_SCAN
            if (this._isBareTagName(itemPart)) return null;

            const rootSelector = rootParts.join(' > ');

            // Require a specific root container — if rootSelector is empty the scan would
            // cover the entire page and match items from OTHER sections (e.g. two separate
            // accordion groups both containing ".accordion-item" → wrong scope / "duplicating").
            if (!rootSelector) return null;

            return {
                rootSelector,
                itemSelector: itemPart,
                clickPath: clickPathParts.length > 0 ? clickPathParts.join(' > ') : ''
            };
        }

        // CSS path with nth-child(*)
        if (!skeleton.startsWith('//') && skeleton.includes(':nth-child(*)')) {
            const parts = skeleton.split(/\s*>\s*/);
            const varyingIdx = parts.findIndex(p => p.includes(':nth-child(*)'));
            if (varyingIdx < 0) return null;

            const rootParts = parts.slice(0, varyingIdx);
            const itemPart = parts[varyingIdx]
                .replace(/:nth-child\(\*\)/, '')
                .trim();
            const clickPathParts = parts.slice(varyingIdx + 1);

            // Reject bare tag names - too broad for ELEMENT_SCAN
            if (this._isBareTagName(itemPart) || !itemPart) return null;

            const rootSelector = rootParts.join(' > ');

            // Same as nth-of-type: require a specific root to avoid cross-section scope
            if (!rootSelector) return null;

            return {
                rootSelector,
                itemSelector: itemPart,
                clickPath: clickPathParts.length > 0 ? clickPathParts.join(' > ') : ''
            };
        }

        return null;
    }

    /**
     * Check if selector is just a bare tag name without class, id, or attribute qualifiers
     * e.g. "div", "span", "li" → true; "div.tabs", "li.item" → false
     * @private
     */
    _isBareTagName(selector) {
        if (!selector) return true;
        return /^[a-z][a-z0-9]*$/i.test(selector);
    }

    /**
     * Build ELEMENT_SCAN node for a loop group
     * @private
     */
    _buildScanNode(group, scanId) {
        return {
            type: 'ELEMENT_SCAN',
            id: scanId,
            label: `Scan ${group.itemSelector} items`,
            params: {
                rootSelector: group.rootSelector,
                itemSelector: group.itemSelector,
                strategy: 'css'
            },
            connections: [{ to: 0, condition: 'success' }]
        };
    }

    /**
     * Build FOR_EACH_ELEMENT node with nested actions
     * @private
     */
    _buildLoopNode(group, scanId) {
        const actions = [];

        // CLICK: target the click path inside each scanned element
        if (group.clickPath) {
            actions.push({
                type: 'CLICK',
                params: { selector: `{{current.selector}} ${group.clickPath}` }
            });
        } else {
            actions.push({
                type: 'CLICK',
                params: { selector: '{{current.selector}}' }
            });
        }

        // WAIT: let content load after tab/accordion click + pre-screenshot delay
        actions.push({
            type: 'WAIT',
            params: { timeoutMs: Math.max(500, this.preScreenshotDelay) }
        });

        // SCREENSHOT: capture with loop-indexed filename
        actions.push({
            type: 'SCREENSHOT',
            params: {
                ...this._screenshotModeParams(),
                filename: `${scanId}_item-{{loop.index}}`
            }
        });

        return {
            type: 'FOR_EACH_ELEMENT',
            label: `Click and capture each ${group.itemSelector}`,
            params: {
                mode: 'for-each',
                source: scanId,
                maxIterations: 50,
                actions
            },
            connections: [{ to: 0, condition: 'success' }]
        };
    }

    /**
     * Validate compiled workflow for common issues
     * Logs warnings but does not block compilation
     * @param {Array} workflow
     * @private
     */
    _validateWorkflow(workflow) {
        const scanIds = new Set();
        const forEachSources = [];

        for (let i = 0; i < workflow.length; i++) {
            const node = workflow[i];

            // Every node must have type
            if (!node.type) {
                console.warn(`WorkflowCompiler: Node at index ${i} missing type`);
            }

            // Non-terminal nodes must have connections
            if (node.type !== 'OUTPUT' && (!node.connections || node.connections.length === 0)) {
                console.warn(`WorkflowCompiler: Node ${i} (${node.type}) missing connections`);
            }

            // Connection indices must be valid
            if (node.connections) {
                for (const conn of node.connections) {
                    if (conn.to < 0 || conn.to >= workflow.length) {
                        console.warn(`WorkflowCompiler: Node ${i} (${node.type}) connection points to invalid index ${conn.to}`);
                    }
                }
            }

            // Selector-based nodes must have selector
            if (['CLICK', 'TYPE'].includes(node.type) && !node.params?.selector) {
                console.warn(`WorkflowCompiler: ${node.type} node at index ${i} missing selector`);
            }

            // Track ELEMENT_SCAN ids and FOR_EACH sources
            if (node.type === 'ELEMENT_SCAN' && node.id) {
                scanIds.add(node.id);
            }
            if (node.type === 'FOR_EACH_ELEMENT' && node.params?.source) {
                forEachSources.push({ index: i, source: node.params.source });
            }
        }

        // Validate FOR_EACH sources match ELEMENT_SCAN ids
        for (const { index, source } of forEachSources) {
            if (!scanIds.has(source)) {
                console.warn(`WorkflowCompiler: FOR_EACH at index ${index} references source '${source}' but no ELEMENT_SCAN has that id`);
            }
        }
    }
}
