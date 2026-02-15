/**
 * FlowCapture - Trace Interpreter
 *
 * Transforma steps brutos em ações semânticas executáveis.
 * Pipeline: Raw Steps → Collections → Effects → Patterns → Workflow Nodes
 *
 * Usa visual_settling (frame-level) ao invés de visual_changes (property-level).
 * Detecta coleções via seletores irmãos, efeitos via class_toggles e new_elements.
 */

import { CONFIG } from './constants.js';

export class TraceInterpreter {
    constructor() {
        this.collectionThreshold = 2;
    }

    interpret(steps, url = null) {
        if (!steps || steps.length === 0) {
            return {
                actions: [],
                patterns: [],
                workflow_nodes: { nodes: [], connections: [] },
                workflow_steps: [],
                metadata: { format_version: '4.0' }
            };
        }

        const collections = this._detectCollections(steps);
        const actions = this._deriveSemanticActions(steps, collections);
        const patterns = this._identifyPatterns(actions, collections);
        const workflowNodes = this._synthesizeWorkflow(patterns, actions);

        // NEW: Transform to spec-compliant flat array format
        const workflowSteps = this._transformToWorkflowSteps(workflowNodes, actions, url);

        return {
            actions,
            patterns,
            workflow_nodes: workflowNodes,  // OLD format (keep for compatibility)
            workflow_steps: workflowSteps,   // NEW format (spec-compliant)
            metadata: {
                originalStepCount: steps.length,
                derivedActionCount: actions.length,
                timestamp: Date.now(),
                format_version: '4.0'
            }
        };
    }

    // ─── Detecção de Coleções ─────────────────────────────

    /**
     * Detecta elementos repetidos que formam uma coleção.
     * Ex: li:nth-of-type(1), li:nth-of-type(2) → mesma coleção
     */
    _detectCollections(steps) {
        const counts = new Map();

        for (const step of steps) {
            if (step.trigger?.type !== 'click') continue;
            const selector = step.trigger.selector;
            if (!selector) continue;

            const normalized = this._normalizeSelector(selector);

            if (!counts.has(normalized)) {
                counts.set(normalized, {
                    base: normalized,
                    originalSelectors: new Set(),
                    count: 0
                });
            }

            const data = counts.get(normalized);
            data.count++;
            data.originalSelectors.add(selector);
        }

        // Só é coleção se tem múltiplos seletores diferentes pro mesmo base
        const collections = new Map();
        for (const [normalized, data] of counts) {
            if (data.originalSelectors.size > 1) {
                collections.set(normalized, data);
            }
        }

        return collections;
    }

    _normalizeSelector(selector) {
        return selector
            .replace(/:nth-[a-z-]+\(\d+\)/g, '')
            .replace(/\[index=["']\d+["']\]/g, '')
            .trim();
    }

    // ─── Ações Semânticas ─────────────────────────────────

    _deriveSemanticActions(steps, collections) {
        return steps.map(step => {
            const trigger = step.trigger || {};
            const normalizedSelector = this._normalizeSelector(trigger.selector || '');
            const isCollectionItem = collections.has(normalizedSelector);

            const action = {
                type: 'EXECUTABLE_INTENT',
                intent: this._deriveIntent(step),
                label: this._deriveLabel(step),
                trigger: {
                    type: trigger.type,
                    selector: isCollectionItem ? normalizedSelector : trigger.selector,
                    is_collection: isCollectionItem,
                    original_selector: trigger.selector,
                    metadata: trigger.metadata || {}
                },
                effects: this._deriveEffects(step),
                requires_stabilization: this._needsStabilization(step)
            };

            if (action.requires_stabilization) {
                action.stabilization_rule = {
                    wait_until: 'layout_stable',
                    threshold_px: CONFIG.STABILIZATION.LAYOUT_DELTA,
                    min_frames: CONFIG.STABILIZATION.MIN_STABLE_FRAMES
                };
            }

            // Capture target = maior elemento novo que apareceu
            if (action.effects.dominant_new_element) {
                action.capture_target = action.effects.dominant_new_element;
            }

            return action;
        });
    }

    _deriveLabel(step) {
        const trigger = step.trigger || {};
        const meta = trigger.metadata || {};
        const type = trigger.type?.toUpperCase() || 'ACTION';

        if (meta.ariaLabel) return `${type} ["${meta.ariaLabel}"]`;
        if (meta.testId) return `${type} (tid: ${meta.testId})`;
        if (meta.text) return `${type} "${meta.text}"`;
        if (meta.placeholder) return `${type} [${meta.placeholder}]`;
        if (trigger.key) return `${type} [${trigger.key}] on ${meta.tagName || 'element'}`;

        return `${type} on ${meta.tagName || 'element'}`;
    }

    /**
     * Deriva intent semântico do step.
     * Usa body_class_changes pra detectar overlay, e visual_settling pra detectar transições.
     */
    _deriveIntent(step) {
        if (step.trigger?.type === 'checkpoint') return 'INITIAL_STATE_CAPTURE';

        const effects = step.effects || {};
        const settling = step.visual_settling || {};
        const meta = step.trigger?.metadata || {};

        // Body class indica overlay/modal aberto?
        const addedBodyClasses = effects.body_class_changes?.added || [];
        const hasOverlayClasses = addedBodyClasses.some(c =>
            c.includes('modal') || c.includes('overlay') || c.includes('open') || c.includes('active')
        );

        if (hasOverlayClasses) return 'OPEN_OVERLAY';

        // Layout shift significativo + botão/link = UI_EXPANSION
        const hasVisualShift = settling.max_layout_shift > 5;
        const isLikelyTrigger = meta.tagName === 'button' || meta.role === 'button' || meta.tagName === 'a';

        if (hasVisualShift && isLikelyTrigger) return 'UI_EXPANSION';

        // Elementos novos apareceram = VISUAL_TRANSITION
        if (effects.new_elements?.length > 0) return 'VISUAL_TRANSITION';

        // Layout shift menor mas existente
        if (hasVisualShift) return 'VISUAL_TRANSITION';

        if (step.trigger?.type === 'submit') return 'FORM_SUBMISSION';
        if (step.trigger?.type === 'keydown' && step.trigger?.key === 'Enter') return 'CONFIRM_ACTION';
        if (step.trigger?.type === 'keydown' && step.trigger?.key === 'Escape') return 'CANCEL_ACTION';

        return 'USER_INTERACTION';
    }

    /**
     * Deriva efeitos do step.
     * Usa effects.new_elements pra encontrar o elemento dominante novo.
     */
    _deriveEffects(step) {
        const effects = step.effects || {};
        const settling = step.visual_settling || {};

        const derived = {
            visual_shift: settling.max_layout_shift > 0,
            class_toggles: !!effects.class_toggles?.length,
            body_state_change: !!effects.body_class_changes
        };

        // Overlay aberto?
        const addedClasses = effects.body_class_changes?.added || [];
        if (addedClasses.some(c => c.includes('modal') || c.includes('open') || c.includes('overlay'))) {
            derived.is_overlay_open = true;
        }

        // Elemento dominante novo = o maior (width * height) entre os new_elements
        if (effects.new_elements?.length > 0) {
            let maxArea = 0;
            let dominant = null;

            for (const el of effects.new_elements) {
                const area = (el.rect?.width || 0) * (el.rect?.height || 0);
                // Ignora backdrops e fades
                if (el.selector?.includes('backdrop') || el.selector?.includes('fade')) continue;
                if (area > maxArea) {
                    maxArea = area;
                    dominant = el.selector;
                }
            }

            // Fallback pro primeiro se todos eram backdrop
            derived.dominant_new_element = dominant || effects.new_elements[0].selector;
        }

        return derived;
    }

    /**
     * Step precisa de estabilização se teve layout shift significativo.
     * Threshold: max_layout_shift > 1px (qualquer animação/transição detectável)
     */
    _needsStabilization(step) {
        const settling = step.visual_settling;
        if (!settling) return false;
        return settling.max_layout_shift > 1;
    }

    // ─── Detecção de Patterns ─────────────────────────────

    _identifyPatterns(actions, collections) {
        const patterns = [];

        // Pattern: interação com coleção (clicou em múltiplos irmãos)
        for (const [baseSelector, data] of collections) {
            const collectionActions = actions.filter(a => a.trigger.selector === baseSelector);

            if (collectionActions.length > 0) {
                const intents = collectionActions.map(a => a.intent);
                const isConsistent = new Set(intents).size === 1;

                // Verifica se os efeitos são consistentes (mesmo tipo de resultado)
                const effectProfiles = collectionActions.map(a => ({
                    has_new_element: !!a.effects.dominant_new_element,
                    is_overlay: !!a.effects.is_overlay_open,
                    needs_stabilization: a.requires_stabilization
                }));
                const profilesConsistent = effectProfiles.every(p =>
                    p.has_new_element === effectProfiles[0].has_new_element &&
                    p.is_overlay === effectProfiles[0].is_overlay
                );

                patterns.push({
                    type: 'COLLECTION_INTERACTION',
                    selector: baseSelector,
                    item_count: data.count,
                    dominant_intent: intents[0],
                    is_consistent: isConsistent,
                    effects_consistent: profilesConsistent
                });
            }
        }

        // Pattern: overlay flow
        if (actions.some(a => a.intent === 'OPEN_OVERLAY' || a.effects.is_overlay_open)) {
            patterns.push({ type: 'OVERLAY_FLOW_DETECTED', confidence: 'high' });
        }

        return patterns;
    }

    // ─── Síntese de Workflow ──────────────────────────────

    _synthesizeWorkflow(patterns, actions) {
        const nodes = [];
        const connections = [];

        // 1. Sempre começa com START (auto-inject if needed)
        nodes.push({
            id: "node_0",
            node_type: 'START',
            config: {}
        });

        const collectionPattern = patterns.find(p => p.type === 'COLLECTION_INTERACTION');

        if (collectionPattern) {
            const sampleAction = actions.find(a => a.trigger.selector === collectionPattern.selector);

            // ELEMENT_SCAN (node_1)
            nodes.push({
                id: "node_1",
                node_type: 'ELEMENT_SCAN',
                config: {
                    selector: collectionPattern.selector,
                    limit: collectionPattern.item_count
                }
            });
            connections.push({ source: 0, target: 1 });

            // FOR_EACH_ITEM (node_2)
            const iteratorNode = {
                id: "node_2",
                node_type: 'FOR_EACH_ITEM',
                config: { source_node: 'node_1' },
                children: [
                    { node_type: 'CLICK', config: { selector: '{{current.selector}}' } }
                ]
            };

            if (sampleAction?.requires_stabilization) {
                iteratorNode.children.push({
                    node_type: 'WAIT_VISUAL_STABLE',
                    config: {
                        observe: sampleAction.capture_target || 'body',
                        stabilization_rule: sampleAction.stabilization_rule
                    }
                });
            }

            iteratorNode.children.push({
                node_type: 'SCREENSHOT',
                config: {
                    target: sampleAction?.capture_target || 'body',
                    full_scroll: true
                }
            });

            if (sampleAction?.effects?.is_overlay_open) {
                iteratorNode.children.push({
                    node_type: 'CLOSE_MODAL',
                    config: { heuristic: 'ESCAPE_OR_BODY_CLICK' }
                });
            }

            nodes.push(iteratorNode);
            connections.push({ source: 1, target: 2 });

            // Finaliza com OUTPUT (node_3)
            nodes.push({
                id: "node_3",
                node_type: 'OUTPUT',
                config: {}
            });
            connections.push({ source: 2, target: 3 });

        } else {
            // Fallback: workflow linear
            let lastNodeIndex = 0;

            for (const action of actions) {
                if (action.intent === 'INITIAL_STATE_CAPTURE') continue;

                const currentNodeId = `node_${nodes.length}`;
                nodes.push({
                    id: currentNodeId,
                    node_type: action.trigger.type.toUpperCase(),
                    config: { selector: action.trigger.selector }
                });

                connections.push({ source: lastNodeIndex, target: nodes.length - 1 });
                lastNodeIndex = nodes.length - 1;

                if (action.requires_stabilization) {
                    const waitNodeId = `node_${nodes.length}`;
                    nodes.push({
                        id: waitNodeId,
                        node_type: 'WAIT_VISUAL_STABLE',
                        config: {
                            observe: action.capture_target || 'body',
                            stabilization_rule: action.stabilization_rule
                        }
                    });
                    connections.push({ source: lastNodeIndex, target: nodes.length - 1 });
                    lastNodeIndex = nodes.length - 1;
                }

                if (action.intent === 'OPEN_OVERLAY' || action.intent === 'VISUAL_TRANSITION') {
                    const snapNodeId = `node_${nodes.length}`;
                    nodes.push({
                        id: snapNodeId,
                        node_type: 'SCREENSHOT',
                        config: { target: action.capture_target || 'body' }
                    });
                    connections.push({ source: lastNodeIndex, target: nodes.length - 1 });
                    lastNodeIndex = nodes.length - 1;
                }
            }

            // Finaliza com OUTPUT
            nodes.push({
                id: `node_${nodes.length}`,
                node_type: 'OUTPUT',
                config: {}
            });
            connections.push({ source: lastNodeIndex, target: nodes.length - 1 });
        }

        // Validate and auto-inject if needed
        let workflow = { nodes, connections };
        const validation = this._validateGraph(nodes, connections);

        if (!validation.valid) {
            console.error('TraceInterpreter: Graph validation failed', validation.errors);
            // Attempt to fix
            workflow = this._autoInjectNodes(workflow);
        }

        if (validation.warnings.length > 0) {
            console.warn('TraceInterpreter: Graph warnings', validation.warnings);
        }

        return workflow;
    }

    // ─── Transformação para Formato Spec-Compliant ────────

    /**
     * Transform {nodes, connections} to flat array with embedded connections
     * This is the NEW format required by the workflow engine spec
     * @param {Object} workflowNodes - Current format {nodes, connections}
     * @param {Array} actions - Semantic actions for label generation
     * @param {string} url - Page URL for START node
     * @returns {Array} Spec-compliant workflow steps
     */
    _transformToWorkflowSteps(workflowNodes, actions, url) {
        const { nodes, connections } = workflowNodes;
        const steps = [];

        // Build connection map: source_index -> [target_indices]
        const connectionMap = new Map();
        connections.forEach(conn => {
            if (!connectionMap.has(conn.source)) {
                connectionMap.set(conn.source, []);
            }
            connectionMap.get(conn.source).push(conn.target);
        });

        // Transform each node
        nodes.forEach((node, index) => {
            const step = {
                type: this._mapNodeType(node.node_type),
                label: this._generateStepLabel(node, index, actions),
                params: this._transformParams(node, url, index),
                connections: this._buildConnections(index, connectionMap)
            };

            steps.push(step);
        });

        return steps;
    }

    /**
     * Map old node_type to new type (spec format)
     */
    _mapNodeType(nodeType) {
        const mapping = {
            'START': 'START',
            'ELEMENT_SCAN': 'ELEMENT_SCAN',
            'FOR_EACH_ITEM': 'FOR_EACH_ELEMENT',
            'CLICK': 'CLICK',
            'INPUT': 'TYPE',
            'INPUT_CHANGE': 'TYPE',
            'KEYDOWN': 'CLICK',  // Simplified
            'FOCUS': 'CLICK',     // Simplified
            'WAIT_VISUAL_STABLE': 'WAIT',
            'SCREENSHOT': 'SCREENSHOT',
            'CLOSE_MODAL': 'CLICK',  // Close is typically a click action
            'OUTPUT': 'OUTPUT'
        };

        return mapping[nodeType] || nodeType;
    }

    /**
     * Generate human-readable label for step
     */
    _generateStepLabel(node, index, actions) {
        const type = node.node_type;

        // Pre-defined labels for special nodes
        const labels = {
            'START': 'Open page',
            'OUTPUT': 'Save results',
            'ELEMENT_SCAN': `Scan ${node.config.selector || 'elements'}`,
            'FOR_EACH_ITEM': 'Process each item',
            'SCREENSHOT': 'Capture screenshot',
            'WAIT_VISUAL_STABLE': 'Wait for page to stabilize'
        };

        if (labels[type]) {
            return labels[type];
        }

        // For action nodes, try to use semantic action label
        if (actions && actions[index]) {
            return actions[index].label || `Step ${index + 1}`;
        }

        return `${type.toLowerCase().replace(/_/g, ' ')}`;
    }

    /**
     * Transform config to params format (spec requirement)
     */
    _transformParams(node, url, nodeIndex) {
        const params = {};

        // START node gets URL
        if (node.node_type === 'START') {
            params.url = url || 'https://example.com';
            return params;
        }

        // FOR_EACH_ITEM children become actions array
        if (node.node_type === 'FOR_EACH_ITEM') {
            // Extract numeric index from source_node (e.g., "node_1" -> 1)
            const sourceNodeId = node.config.source_node;
            params.source = parseInt(sourceNodeId.replace('node_', ''));
            params.mode = 'for-each';
            params.maxIterations = node.config.limit || 10;

            // Transform children to flat actions
            if (node.children && node.children.length > 0) {
                params.actions = node.children.map(child => {
                    const action = {
                        type: this._mapNodeType(child.node_type),
                        params: {}
                    };

                    // Map child config to params
                    if (child.config) {
                        Object.assign(action.params, child.config);

                        // Special handling for SCREENSHOT
                        if (child.node_type === 'SCREENSHOT') {
                            action.params = {
                                captureMode: 'page',
                                target: 'element',
                                selector: child.config.target || 'body',
                                format: 'jpeg',
                                viewportWidth: 1440,
                                useDynamicHeight: true,
                                dynamicHeightDelay: 1,
                                fullPage: true,
                                filename: child.config.filename || 'screenshot-{{loop.index}}'
                            };
                        }

                        // Special handling for WAIT
                        if (child.node_type === 'WAIT_VISUAL_STABLE') {
                            action.params = {
                                condition: 'layout-stable',
                                timeoutMs: 3000
                            };
                        }
                    }

                    return action;
                });
            } else {
                params.actions = [];
            }

            return params;
        }

        // ELEMENT_SCAN gets rootSelector + itemSelector
        if (node.node_type === 'ELEMENT_SCAN') {
            const selector = node.config.selector;

            // Try to infer root from selector (e.g., "ul > li" -> root="ul", item="li")
            const parts = selector?.split(/\s*>\s*/);

            if (parts && parts.length > 1) {
                params.rootSelector = parts.slice(0, -1).join(' > ');
                params.itemSelector = parts[parts.length - 1];
            } else {
                // Fallback: use selector as itemSelector, infer root
                params.rootSelector = this._inferRootSelector(selector);
                params.itemSelector = selector;
            }

            if (node.config.limit) {
                params.maxItems = node.config.limit;
            }

            params.strategy = 'css';

            return params;
        }

        // WAIT_VISUAL_STABLE -> WAIT with condition
        if (node.node_type === 'WAIT_VISUAL_STABLE') {
            params.condition = 'layout-stable';
            params.timeoutMs = 3000;
            if (node.config.observe) {
                params.selector = node.config.observe;
            }
            return params;
        }

        // SCREENSHOT params (full spec format)
        if (node.node_type === 'SCREENSHOT') {
            params.captureMode = 'page';
            params.target = 'element';
            params.selector = node.config.target || 'body';
            params.format = 'jpeg';
            params.viewportWidth = 1440;
            params.useDynamicHeight = true;
            params.dynamicHeightDelay = 1;
            params.fullPage = true;
            params.filename = node.config.filename || `screenshot-${nodeIndex}`;
            return params;
        }

        // Default: copy config to params
        Object.assign(params, node.config);

        return params;
    }

    /**
     * Build connections array for a step (embedded format)
     */
    _buildConnections(index, connectionMap) {
        const targets = connectionMap.get(index) || [];

        if (targets.length === 0) {
            return []; // Terminal node (OUTPUT)
        }

        // Normal flow: single success connection
        if (targets.length === 1) {
            return [{ to: targets[0], condition: 'success' }];
        }

        // Multiple targets: assume first is success, others are error/retry
        return [
            { to: targets[0], condition: 'success' },
            ...targets.slice(1).map(t => ({ to: t, condition: 'error' }))
        ];
    }

    /**
     * Infer root selector from item selector
     * Example: "li.item" -> "ul", "div.card" -> "div.container"
     */
    _inferRootSelector(itemSelector) {
        if (!itemSelector) return 'body';

        // Remove pseudo-selectors and nth-of-type
        const cleaned = itemSelector.replace(/:nth-[a-z-]+\(\d+\)/g, '').trim();

        // Common patterns
        if (cleaned.startsWith('li')) return 'ul';
        if (cleaned.startsWith('tr')) return 'tbody';
        if (cleaned.startsWith('option')) return 'select';

        // Fallback: append "-container" or use parent pattern
        const tag = cleaned.split(/[.:#\[]/)[ 0];
        return `${tag}-container`;
    }

    // ─── Graph Validation & Auto-Injection ────────────────

    /**
     * Validate workflow graph for cycles and structural issues
     * @param {Array} nodes - Workflow nodes
     * @param {Array} connections - Workflow connections
     * @returns {Object} Validation result {valid, errors, warnings}
     */
    _validateGraph(nodes, connections) {
        const errors = [];
        const warnings = [];

        // Check for cycles using DFS
        const visited = new Set();
        const stack = new Set();

        const hasCycle = (index) => {
            if (stack.has(index)) {
                errors.push(`Cycle detected at node ${index}`);
                return true;
            }
            if (visited.has(index)) return false;

            visited.add(index);
            stack.add(index);

            const targets = connections.filter(c => c.source === index);
            for (const conn of targets) {
                if (hasCycle(conn.target)) return true;
            }

            stack.delete(index);
            return false;
        };

        // Check all nodes for cycles
        for (let i = 0; i < nodes.length; i++) {
            if (hasCycle(i)) break;
        }

        // Check for orphaned nodes (no incoming connections except START)
        const hasIncoming = new Set();
        connections.forEach(c => hasIncoming.add(c.target));

        nodes.forEach((node, index) => {
            if (index === 0) return; // START node expected to have no incoming
            if (!hasIncoming.has(index)) {
                warnings.push(`Node ${index} (${node.node_type}) has no incoming connections`);
            }
        });

        // Check for missing START
        if (nodes.length > 0 && nodes[0].node_type !== 'START') {
            errors.push('Missing START node at index 0');
        }

        // Check for missing OUTPUT
        if (nodes.length > 0 && nodes[nodes.length - 1].node_type !== 'OUTPUT') {
            warnings.push('Missing OUTPUT node at the end');
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Auto-inject missing START or OUTPUT nodes
     * @param {Object} workflowNodes - Workflow {nodes, connections}
     * @returns {Object} Fixed workflow {nodes, connections}
     */
    _autoInjectNodes(workflowNodes) {
        const { nodes, connections } = workflowNodes;

        // Auto-inject START if missing
        if (nodes.length === 0 || nodes[0].node_type !== 'START') {
            console.warn('TraceInterpreter: Auto-injecting START node');
            nodes.unshift({
                id: 'node_-1',
                node_type: 'START',
                config: {}
            });

            // Shift all connection indices +1
            connections.forEach(conn => {
                conn.source++;
                conn.target++;
            });

            // Connect START to first real node
            if (nodes.length > 1) {
                connections.unshift({ source: 0, target: 1 });
            }
        }

        // Auto-inject OUTPUT if missing
        if (nodes.length === 0 || nodes[nodes.length - 1].node_type !== 'OUTPUT') {
            console.warn('TraceInterpreter: Auto-injecting OUTPUT node');
            const outputIndex = nodes.length;
            nodes.push({
                id: `node_${outputIndex}`,
                node_type: 'OUTPUT',
                config: {}
            });

            // Connect last non-OUTPUT node to OUTPUT
            if (nodes.length > 1) {
                connections.push({ source: outputIndex - 1, target: outputIndex });
            }
        }

        return { nodes, connections };
    }
}
