/**
 * Expansion Manager Service
 * Encapsulates all element expansion logic (~200 lines extracted from content.js)
 *
 * Responsibilities:
 * - Track expanded elements
 * - Find constrained containers
 * - Apply/undo CSS expansions
 * - Handle height adjustments
 *
 * Usage:
 * const manager = new ExpansionManager(selectorEngine, sessionManager);
 * manager.expandElement(el);
 * manager.adjustHeight(el, 50);
 * manager.undo(el);
 */

export class ExpansionManager {
    constructor(selectorEngine, sessionManager) {
        this.selectorEngine = selectorEngine;
        this.sessionManager = sessionManager;
        this._expandedElements = new WeakMap();
        this._lastExpandedElement = null;
        this._heightAdjustmentTimeout = null;
    }

    /**
     * Find nearest constrained container (scrollHeight > clientHeight)
     * @param {Element} startEl
     * @returns {Element|null}
     */
    findConstrainedContainer(startEl) {
        let el = startEl;
        const threshold = 5;

        while (el && el !== document.documentElement && el !== document.body) {
            if (el.scrollHeight > el.clientHeight + threshold) {
                const cs = getComputedStyle(el);
                const hasFixedHeight = cs.height !== 'auto' && cs.height !== '';
                const hasMaxHeight = cs.maxHeight !== 'none' && cs.maxHeight !== '';
                const hasOverflowClip = cs.overflow === 'hidden' || cs.overflowY === 'hidden'
                    || cs.overflow === 'auto' || cs.overflowY === 'auto'
                    || cs.overflow === 'scroll' || cs.overflowY === 'scroll';

                if (hasFixedHeight || hasMaxHeight || hasOverflowClip) {
                    return el;
                }
            }
            el = el.parentElement;
        }

        // Fallback: startEl itself if it has fixed height or max-height
        const cs = getComputedStyle(startEl);
        if (cs.height !== 'auto' || cs.maxHeight !== 'none') {
            return startEl;
        }

        return null;
    }

    /**
     * Apply CSS expansion to element + clear ancestor constraints
     * @param {Element} container
     * @returns {Object} snapshot of original styles for undo
     */
    apply(container) {
        const originalStyles = {
            container: {
                height: container.style.height,
                maxHeight: container.style.maxHeight,
                overflow: container.style.overflow,
                overflowY: container.style.overflowY
            },
            ancestors: []
        };

        // Expand the container
        const targetHeight = container.scrollHeight;
        container.style.setProperty('height', `${targetHeight}px`, 'important');
        container.style.setProperty('max-height', 'none', 'important');
        container.style.setProperty('overflow', 'visible', 'important');

        // Walk up ancestors and clear height/max-height/overflow constraints
        let ancestor = container.parentElement;
        let depth = 0;
        const maxDepth = 10;

        while (ancestor && ancestor !== document.documentElement && depth < maxDepth) {
            const cs = getComputedStyle(ancestor);
            const needsClear = (
                (cs.height !== 'auto' && cs.height !== '') ||
                (cs.maxHeight !== 'none' && cs.maxHeight !== '') ||
                cs.overflow === 'hidden' || cs.overflowY === 'hidden'
            );

            if (needsClear) {
                originalStyles.ancestors.push({
                    element: ancestor,
                    height: ancestor.style.height,
                    maxHeight: ancestor.style.maxHeight,
                    overflow: ancestor.style.overflow,
                    overflowY: ancestor.style.overflowY
                });

                ancestor.style.setProperty('height', 'auto', 'important');
                ancestor.style.setProperty('max-height', 'none', 'important');
                ancestor.style.setProperty('overflow', 'visible', 'important');
            }

            ancestor = ancestor.parentElement;
            depth++;
        }

        return originalStyles;
    }

    /**
     * Undo a previous expansion, restoring original CSS
     * @param {Element} container
     */
    undo(container) {
        const saved = this._expandedElements.get(container);
        if (!saved) return;

        // Restore container styles
        const c = saved.container;
        container.style.height = c.height;
        container.style.maxHeight = c.maxHeight;
        container.style.overflow = c.overflow;
        container.style.overflowY = c.overflowY;

        // Restore ancestor styles
        for (const a of saved.ancestors) {
            a.element.style.height = a.height;
            a.element.style.maxHeight = a.maxHeight;
            a.element.style.overflow = a.overflow;
            a.element.style.overflowY = a.overflowY;
        }

        this._expandedElements.delete(container);
    }

    /**
     * Try to undo expansion on element or any ancestor
     * @param {Element} startEl
     * @returns {boolean} true if undo was performed
     */
    tryUndo(startEl) {
        let el = startEl;
        while (el && el !== document.documentElement) {
            if (this._expandedElements.has(el)) {
                this.undo(el);
                return true;
            }
            el = el.parentElement;
        }
        return false;
    }

    /**
     * Check if element is expanded
     * @param {Element} el
     * @returns {boolean}
     */
    isExpanded(el) {
        return this._expandedElements.has(el);
    }

    /**
     * Expand element + record as expand event
     * @param {Element} container
     * @param {Object} config - { clearAncestorConstraints, mode }
     * @returns {Object} original styles
     */
    expandElement(container, config = {}) {
        const { clearAncestorConstraints = true, mode = 'fit-content' } = config;

        const originalStyles = this.apply(container);
        this._expandedElements.set(container, originalStyles);
        this._lastExpandedElement = container;

        // Record as expand event
        const selector = this.selectorEngine.getUniqueSelector(container);
        this.sessionManager.startSession({
            type: 'expand',
            target: container,
            expandParams: {
                selector,
                mode,
                clearAncestorConstraints,
                appliedHeight: container.style.height
            }
        });

        return originalStyles;
    }

    /**
     * Manually adjust height of expanded element
     * @param {Element} el
     * @param {number} delta - pixels to add/subtract
     */
    adjustHeight(el, delta) {
        const finalEl = el || this._lastExpandedElement;
        if (!finalEl || !this._expandedElements.has(finalEl)) {
            return false;
        }

        const currentRect = finalEl.getBoundingClientRect();
        const currentHeight = currentRect.height;
        const newHeight = Math.max(50, currentHeight + delta); // Min 50px

        finalEl.style.setProperty('height', `${newHeight}px`, 'important');

        // Debounce recording
        this._recordHeightAdjustment(finalEl, newHeight);

        return true;
    }

    /**
     * Record height adjustment (debounced)
     * @private
     */
    _recordHeightAdjustment(el, height) {
        if (this._heightAdjustmentTimeout) {
            clearTimeout(this._heightAdjustmentTimeout);
        }

        this._heightAdjustmentTimeout = setTimeout(() => {
            const selector = this.selectorEngine.getUniqueSelector(el);
            this.sessionManager.startSession({
                type: 'expand',
                target: el,
                expandParams: {
                    selector,
                    mode: 'absolute',
                    value: height,
                    clearAncestorConstraints: true
                }
            });
        }, 600);
    }

    /**
     * Get last expanded element
     * @returns {Element|null}
     */
    getLastExpandedElement() {
        return this._lastExpandedElement;
    }

    /**
     * Clear all tracking state (useful for page navigation)
     */
    cleanup() {
        if (this._heightAdjustmentTimeout) {
            clearTimeout(this._heightAdjustmentTimeout);
        }
        this._expandedElements = new WeakMap();
        this._lastExpandedElement = null;
    }
}
