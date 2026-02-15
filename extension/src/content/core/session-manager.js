/**
 * FlowCapture - Session Manager
 *
 * Gerencia o ciclo de vida de cada interação.
 * Uma InteractionSession captura: trigger → mutações → estabilização visual → step.
 *
 * Output de cada step:
 * {
 *   step_id, trigger, effects, visual_settling, duration_ms
 * }
 *
 * effects contém class_toggles, body_class_changes, new_elements, visual_shift_detected.
 * visual_settling vem direto do LayoutStabilizer (frames_observed, max_layout_shift, etc).
 * Não rastreamos QUAIS propriedades mudaram — só QUANDO parou.
 */

import { CONFIG } from '../../shared/constants.js';
import { LayoutStabilizer } from './layout-stabilizer.js';

export class SessionManager {
    constructor(selectorEngine, onSessionComplete) {
        this.selectorEngine = selectorEngine;
        this.onSessionComplete = onSessionComplete;
        this.currentSession = null;
        this.lastEvent = null; // For deduplication
    }

    startSession(triggerEvent) {
        // Deduplication check
        if (this._isDuplicate(triggerEvent)) {
            console.log('SessionManager: Duplicate event ignored', triggerEvent.type);
            return null;
        }

        if (this.currentSession && !this.currentSession.isFinalized) {
            this.currentSession.finalize();
        }

        this.currentSession = new InteractionSession(
            triggerEvent,
            this.selectorEngine,
            (stepData) => {
                if (this.onSessionComplete) this.onSessionComplete(stepData);
                if (this.currentSession?.id === stepData.step_id) {
                    this.currentSession = null;
                }
            }
        );

        // Track last event for deduplication
        this.lastEvent = {
            target: triggerEvent.target,
            type: triggerEvent.type,
            timestamp: Date.now()
        };

        return this.currentSession;
    }

    /**
     * Check if event is duplicate and should be ignored
     * @param {Object} triggerEvent - Event to check
     * @returns {boolean} True if duplicate
     * @private
     */
    _isDuplicate(triggerEvent) {
        if (!this.lastEvent) return false;

        const timeDelta = Date.now() - this.lastEvent.timestamp;
        const isSameTarget = this.lastEvent.target === triggerEvent.target;
        const isSameType = this.lastEvent.type === triggerEvent.type;

        // Same target + type within 500ms = duplicate
        if (isSameTarget && isSameType && timeDelta < 500) {
            return true;
        }

        // input + change on same target within 1s = duplicate
        const isInputChange =
            (this.lastEvent.type === 'input' && triggerEvent.type === 'change') ||
            (this.lastEvent.type === 'change' && triggerEvent.type === 'input') ||
            (this.lastEvent.type === 'input' && triggerEvent.type === 'input_change') ||
            (this.lastEvent.type === 'input_change' && triggerEvent.type === 'input');

        if (isSameTarget && isInputChange && timeDelta < 1000) {
            return true;
        }

        return false;
    }

    addMutation(mutation) {
        if (this.currentSession && !this.currentSession.isFinalized) {
            this.currentSession.addMutation(mutation);
        }
    }

    finalizeCurrentSession() {
        if (this.currentSession && !this.currentSession.isFinalized) {
            this.currentSession.finalize();
            this.currentSession = null;
        }
    }

    hasActiveSession() {
        return this.currentSession !== null && !this.currentSession.isFinalized;
    }
}

/**
 * Uma única interação: trigger + observação de efeitos + estabilização
 */
class InteractionSession {
    constructor(triggerEvent, selectorEngine, onComplete) {
        this.id = Math.random().toString(36).substr(2, 9);
        this.selectorEngine = selectorEngine;
        this.onComplete = onComplete;
        this.isFinalized = false;

        this.trigger = this._buildTrigger(triggerEvent);
        this.beforeBodyClasses = document.body.className;
        this.mutations = [];

        this.layoutStabilizer = new LayoutStabilizer();
        this._initCandidates(triggerEvent.target);

        this.layoutStabilizer.start((visualReport) => {
            this.finalize(visualReport);
        });
    }

    _buildTrigger(triggerEvent) {
        const target = triggerEvent.target;

        // Get primary + fallback selectors for robustness
        const candidates = this.selectorEngine.getMultipleCandidates(target);

        const trigger = {
            type: triggerEvent.type,
            selector: candidates.primary || this.selectorEngine.getUniqueSelector(target),
            selectorFallbacks: candidates.fallbacks || [],
            selectorStrategies: candidates.strategies || [],
            timestamp: Date.now(),
            metadata: this._extractMetadata(target),
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight,
                devicePixelRatio: window.devicePixelRatio || 1
            }
        };

        // Event-specific data
        if (triggerEvent.coordinates) trigger.coordinates = triggerEvent.coordinates;
        if (triggerEvent.modifiers) trigger.modifiers = triggerEvent.modifiers;
        if (triggerEvent.button !== undefined) trigger.button = triggerEvent.button;
        if (triggerEvent.key) trigger.key = triggerEvent.key;

        if (triggerEvent.type === 'input_change' || triggerEvent.type === 'input') {
            trigger.value = triggerEvent.value;
        }
        if (triggerEvent.type === 'scroll') trigger.scroll = triggerEvent.scrollData;

        // Custom events from style-capture helpers
        if (triggerEvent.type === 'style_change') {
            trigger.styleChange = triggerEvent.styleChanges;
        }
        if (triggerEvent.type === 'expand') {
            trigger.expandParams = triggerEvent.expandParams;
        }
        if (triggerEvent.type === 'style_changes_batch') {
            trigger.styleChangesBatch = triggerEvent.styleChanges;
        }
        if (triggerEvent.type === 'capture_point') {
            trigger.captureLabel = triggerEvent.captureLabel;
        }

        return trigger;
    }

    _extractMetadata(el) {
        if (!el || el.nodeType !== 1) return {};

        const meta = {
            tagName: el.tagName.toLowerCase(),
            role: el.getAttribute('role') || el.tagName.toLowerCase()
        };

        // Text content (increased limit to 100 chars)
        let text = '';
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            text = el.value || el.placeholder || '';
        } else {
            text = el.innerText || el.textContent || '';
        }
        meta.text = text.trim().substring(0, 100);

        // ARIA labels
        const ariaLabel = el.getAttribute('aria-label')
            || el.getAttribute('aria-labelledby')
            || el.title
            || el.name;
        if (ariaLabel) meta.ariaLabel = ariaLabel.trim();

        // Common attributes
        if (el.placeholder) meta.placeholder = el.placeholder;
        if (el.getAttribute('data-testid')) meta.testId = el.getAttribute('data-testid');

        // Link/image/form attributes
        if (el.href) meta.href = el.href;
        if (el.src) meta.src = el.src;
        if (el.type) meta.inputType = el.type;
        if (el.name) meta.name = el.name;

        return meta;
    }

    _initCandidates(target) {
        if (!target) return;
        this.layoutStabilizer.addCandidate(target);
        if (target.parentElement) {
            this.layoutStabilizer.addCandidate(target.parentElement);
        }
    }

    /**
     * Recebe mutação do MutationTracker.
     * Elementos novos (childList) vão pro stabilizer com addNewElement
     * pra serem rastreados E marcados como "novos" no report.
     */
    addMutation(record) {
        if (this.isFinalized) return;
        this.mutations.push(record);

        if (record.type === 'childList') {
            record.addedNodes.forEach(node => {
                if (node.nodeType === 1) {
                    const selector = this.selectorEngine.getUniqueSelector(node);
                    this.layoutStabilizer.addNewElement(node, selector);
                }
            });
        } else if (record.type === 'attributes' && record.target.nodeType === 1) {
            this.layoutStabilizer.addCandidate(record.target);
        }
    }

    finalize(visualReport) {
        if (this.isFinalized) return;
        this.isFinalized = true;
        this.layoutStabilizer.stop();

        const step = this._buildStep(visualReport);

        this.layoutStabilizer.cleanup();
        this.mutations = [];

        if (this.onComplete) this.onComplete(step);
    }

    /**
     * Monta o step final com effects + visual_settling.
     * Sem visual_changes por propriedade — só o settling agregado.
     */
    _buildStep(visualReport) {
        const now = Date.now();
        const effects = this._buildEffects();

        const step = {
            step_id: this.id,
            trigger: this.trigger,
            effects,
            duration_ms: now - this.trigger.timestamp
        };

        // visual_settling vem direto do stabilizer
        if (visualReport) {
            step.visual_settling = {
                frames_observed: visualReport.frames_observed,
                max_layout_shift: visualReport.max_layout_shift,
                settle_frame: visualReport.settle_frame,
                stabilized: visualReport.stabilized,
                timed_out: visualReport.timed_out || false,
                total_ms: visualReport.total_ms
            };

            // new_elements do stabilizer → effects
            if (visualReport.new_elements?.length > 0) {
                step.effects.new_elements = visualReport.new_elements;
            }
        }

        return step;
    }

    /**
     * Constrói effects a partir das mutações e body classes.
     * - class_toggles: classes adicionadas/removidas por elemento
     * - body_class_changes: diff de classes do body
     * - visual_shift_detected: true se houve algum layout shift
     */
    _buildEffects() {
        const effects = {};

        // Class toggles dos mutations de atributo 'class'
        const classToggles = this._extractClassToggles();
        if (classToggles.length > 0) {
            effects.class_toggles = classToggles;
        }

        // Body class diff
        const afterBodyClasses = document.body.className;
        const bodyDiff = this._diffClasses(this.beforeBodyClasses, afterBodyClasses);
        if (bodyDiff) {
            effects.body_class_changes = bodyDiff;
        }

        return effects;
    }

    /**
     * Extrai toggles de classe das mutações de atributo.
     * Agrupa por selector, deduplica.
     */
    _extractClassToggles() {
        const toggles = [];
        const seen = new Set();

        for (const m of this.mutations) {
            if (m.type !== 'attributes' || m.attributeName !== 'class') continue;
            if (toggles.length >= CONFIG.LIMITS.MAX_CLASS_CHANGES) break;

            const target = m.target;
            if (target.nodeType !== 1) continue;

            const selector = this.selectorEngine.getUniqueSelector(target);
            if (seen.has(selector)) continue;
            seen.add(selector);

            const diff = this._diffClasses(m.oldValue || '', target.className || '');
            if (diff) {
                toggles.push({ selector, ...diff });
            }
        }

        return toggles;
    }

    _diffClasses(before, after) {
        const b = new Set(before ? before.split(/\s+/).filter(Boolean) : []);
        const a = new Set(after ? after.split(/\s+/).filter(Boolean) : []);

        const added = [...a].filter(x => !b.has(x));
        const removed = [...b].filter(x => !a.has(x));

        if (added.length === 0 && removed.length === 0) return null;
        return { added, removed };
    }
}
