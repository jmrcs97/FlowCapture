/**
 * FlowCapture - Session Manager
 * Extracted from content.js:206-423
 * IMPROVEMENTS:
 * - Dependency injection (selectorEngine via constructor)
 * - Memory leak fix (cleanup on finalize)
 * - Config-driven limits
 * - Separated SessionManager (orchestration) from InteractionSession (data)
 */

import { CONFIG, VISUAL_PROPERTY_PRIORITY } from '../../shared/constants.js';
import { LayoutStabilizer } from './layout-stabilizer.js';

/**
 * Session Manager - Orchestrates recording sessions
 * Manages lifecycle of InteractionSession instances
 */
export class SessionManager {
    /**
     * @param {SelectorEngine} selectorEngine - Selector generator
     * @param {Function} onSessionComplete - Callback when session produces a step
     */
    constructor(selectorEngine, onSessionComplete) {
        this.selectorEngine = selectorEngine;
        this.onSessionComplete = onSessionComplete;
        this.currentSession = null;
    }

    /**
     * Start a new interaction session
     * Finalizes any existing session before creating a new one
     * @param {Object} triggerEvent - Event that triggered the session
     */
    startSession(triggerEvent) {
        // Finalize previous session if still stabilizing (e.g. fast clicks)
        if (this.currentSession && !this.currentSession.isFinalized) {
            this.currentSession.finalize();
        }

        this.currentSession = new InteractionSession(
            triggerEvent,
            this.selectorEngine,
            (stepData) => {
                if (this.onSessionComplete) {
                    this.onSessionComplete(stepData);
                }
                // Clear reference if this is still the current session
                if (this.currentSession && this.currentSession.id === stepData.step_id) {
                    this.currentSession = null;
                }
            }
        );

        return this.currentSession;
    }

    /**
     * Add mutation to current session
     * @param {MutationRecord} mutation - DOM mutation record
     */
    addMutation(mutation) {
        if (this.currentSession && !this.currentSession.isFinalized) {
            this.currentSession.addMutation(mutation);
        }
    }

    /**
     * Finalize current session (e.g. on stop recording)
     */
    finalizeCurrentSession() {
        if (this.currentSession && !this.currentSession.isFinalized) {
            this.currentSession.finalize();
            this.currentSession = null;
        }
    }

    /**
     * Check if there's an active session
     * @returns {boolean}
     */
    hasActiveSession() {
        return this.currentSession !== null && !this.currentSession.isFinalized;
    }

    /**
     * Get current session ID
     * @returns {string|null}
     */
    getCurrentSessionId() {
        return this.currentSession?.id || null;
    }
}

/**
 * Interaction Session - Captures a single user interaction and its effects
 * Monitors DOM changes until layout stabilizes, then produces a step diff
 */
class InteractionSession {
    /**
     * @param {Object} triggerEvent - Event trigger data
     * @param {SelectorEngine} selectorEngine - Selector generator
     * @param {Function} onComplete - Callback with step data
     */
    constructor(triggerEvent, selectorEngine, onComplete) {
        this.id = Math.random().toString(36).substr(2, 9);
        this.selectorEngine = selectorEngine;
        this.onComplete = onComplete;
        this.isFinalized = false;

        // Build trigger data
        this.trigger = this._buildTrigger(triggerEvent);

        // Capture pre-state
        this.beforeState = this._createDOMSnapshot();

        // Collected mutations
        this.mutations = [];

        // Init visual stabilizer with dependency injection
        this.layoutStabilizer = new LayoutStabilizer(selectorEngine);

        // Add trigger target as candidate
        this._initStabilizerCandidates(triggerEvent.target);

        // Start stabilization loop
        this.layoutStabilizer.start((visualReport) => {
            this.finalize(visualReport);
        });
    }

    /**
     * Build trigger data from event
     * @param {Object} triggerEvent
     * @returns {Object} Trigger metadata
     * @private
     */
    _buildTrigger(triggerEvent) {
        const trigger = {
            type: triggerEvent.type,
            selector: this.selectorEngine.getUniqueSelector(triggerEvent.target),
            timestamp: Date.now()
        };

        // Add type-specific data
        if (triggerEvent.type === 'input_change') {
            trigger.value = triggerEvent.value;
        } else if (triggerEvent.type === 'scroll') {
            trigger.scroll = triggerEvent.scrollData;
        }

        return trigger;
    }

    /**
     * Initialize stabilizer with target and parent
     * @param {Element} target - Event target
     * @private
     */
    _initStabilizerCandidates(target) {
        if (!target) return;

        this.layoutStabilizer.addCandidate(target);

        // Also add parent - container often changes size
        if (target.parentElement) {
            this.layoutStabilizer.addCandidate(target.parentElement);
        }
    }

    /**
     * Create lightweight DOM snapshot
     * @returns {Object} Snapshot
     * @private
     */
    _createDOMSnapshot() {
        return {
            bodyClasses: document.body.className,
            timestamp: Date.now()
        };
    }

    /**
     * Add mutation record to session and feed to stabilizer
     * @param {MutationRecord} record
     */
    addMutation(record) {
        if (this.isFinalized) return;

        this.mutations.push(record);

        // Feed mutation targets to visual stabilizer
        if (record.type === 'childList') {
            record.addedNodes.forEach(node => {
                if (node.nodeType === 1) {
                    this.layoutStabilizer.addCandidate(node);
                }
            });
        } else if (record.type === 'attributes' && record.target.nodeType === 1) {
            this.layoutStabilizer.addCandidate(record.target);
        }
    }

    /**
     * Finalize session and produce step diff
     * @param {Object} [visualReport] - Report from layout stabilizer
     */
    finalize(visualReport) {
        if (this.isFinalized) return;
        this.isFinalized = true;

        // Stop stabilizer
        this.layoutStabilizer.stop();

        // Capture post-state
        this.afterState = this._createDOMSnapshot();

        // Compute diff
        const step = this._computeDiff(visualReport);

        // MEMORY LEAK FIX: Clean up stabilizer
        this.layoutStabilizer.cleanup();
        this.mutations = []; // Release mutation references

        // Deliver result
        if (this.onComplete) {
            this.onComplete(step);
        }
    }

    /**
     * Compute step diff from before/after states and visual report
     * @param {Object} visualReport - Visual changes report
     * @returns {Object} Step data
     * @private
     */
    _computeDiff(visualReport) {
        // 1. Process visual changes
        const visualSummary = this._processVisualChanges(visualReport);

        // 2. Process attribute changes
        const attributeChanges = this._processAttributeChanges();

        // 3. Process body class changes
        const bodyClassDiff = this._diffClasses(
            this.beforeState.bodyClasses,
            this.afterState.bodyClasses
        );

        // 4. Construct clean step object
        const step = {
            step_id: this.id,
            trigger: this.trigger,
            visual_changes: visualSummary,
            duration_ms: this.afterState.timestamp - this.trigger.timestamp
        };

        // Optional fields (only include if present)
        if (attributeChanges.length > 0) {
            step.class_changes = attributeChanges;
        }

        if (bodyClassDiff) {
            step.body_class_changes = bodyClassDiff;
        }

        return step;
    }

    /**
     * Process visual changes from stabilizer report
     * @param {Object} visualReport
     * @returns {Array} Sorted, filtered visual change summaries
     * @private
     */
    _processVisualChanges(visualReport) {
        const visualSummary = [];

        if (!visualReport?.visual_changes) return visualSummary;

        // Properties to track with thresholds
        const properties = [
            { name: 'height', threshold: CONFIG.VISUAL_THRESHOLDS.HEIGHT, priority: 3 },
            { name: 'width', threshold: CONFIG.VISUAL_THRESHOLDS.WIDTH, priority: 3 },
            { name: 'opacity', threshold: CONFIG.VISUAL_THRESHOLDS.OPACITY, priority: 2 },
            { name: 'display', threshold: 0, priority: 2 },
            { name: 'visibility', threshold: 0, priority: 2 },
            { name: 'transform', threshold: 0, priority: 1 }
        ];

        Object.keys(visualReport.visual_changes).forEach(sel => {
            const change = visualReport.visual_changes[sel];
            const before = change.before;
            const after = change.after;

            properties.forEach(({ name: p, threshold }) => {
                let valBefore = before.rect?.[p] !== undefined ? before.rect[p] : before[p];
                let valAfter = after.rect?.[p] !== undefined ? after.rect[p] : after[p];

                // Round dimensions for cleaner output
                if (p === 'width' || p === 'height') {
                    valBefore = Math.round(valBefore);
                    valAfter = Math.round(valAfter);
                }

                // Calculate difference
                const diff = typeof valBefore === 'number'
                    ? Math.abs(valAfter - valBefore)
                    : (valBefore !== valAfter ? 1 : 0);

                // Only track significant changes
                if (diff > threshold) {
                    visualSummary.push({
                        selector: sel,
                        property: p,
                        before: valBefore,
                        after: valAfter,
                        delta: typeof valBefore === 'number' ? valAfter - valBefore : null
                    });
                }
            });
        });

        // Sort by significance
        visualSummary.sort((a, b) => {
            const priorityA = VISUAL_PROPERTY_PRIORITY[a.property] || 0;
            const priorityB = VISUAL_PROPERTY_PRIORITY[b.property] || 0;

            if (priorityA !== priorityB) return priorityB - priorityA;

            // Within same priority, sort by magnitude
            const deltaA = Math.abs(a.delta || 0);
            const deltaB = Math.abs(b.delta || 0);
            return deltaB - deltaA;
        });

        // Keep only top N changes (config-driven)
        return visualSummary.slice(0, CONFIG.LIMITS.MAX_VISUAL_CHANGES);
    }

    /**
     * Process attribute mutations into clean changes
     * @returns {Array} Attribute change records
     * @private
     */
    _processAttributeChanges() {
        const changes = [];
        const seenKeys = new Set();

        this.mutations.forEach(m => {
            if (m.type !== 'attributes') return;
            if (changes.length >= CONFIG.LIMITS.MAX_CLASS_CHANGES) return;

            const target = m.target;
            if (target.nodeType !== 1 || m.attributeName !== 'class') return;

            const selector = this.selectorEngine.getUniqueSelector(target);
            const key = `${selector}:${m.attributeName}`;

            if (!seenKeys.has(key)) {
                changes.push({
                    selector,
                    attribute: m.attributeName,
                    old_value: m.oldValue,
                    new_value: target.getAttribute(m.attributeName)
                });
                seenKeys.add(key);
            }
        });

        return changes;
    }

    /**
     * Diff class strings between two states
     * @param {string} before - Before classes
     * @param {string} after - After classes
     * @returns {Object|null} {added, removed} or null if no changes
     * @private
     */
    _diffClasses(before, after) {
        const b = new Set(before ? before.split(/\s+/).filter(c => c) : []);
        const a = new Set(after ? after.split(/\s+/).filter(c => c) : []);

        const added = [...a].filter(x => !b.has(x));
        const removed = [...b].filter(x => !a.has(x));

        if (added.length === 0 && removed.length === 0) return null;
        return { added, removed };
    }
}
