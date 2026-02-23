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
     * Find the INNERMOST element with fixed height (closest to startEl)
     * Strategy: Find the last child with height:Npx before reaching startEl
     * @param {Element} startEl
     * @returns {Element|null}
     */
    findConstrainedContainer(startEl) {
        // Collect all ancestors with fixed height (pixel values)
        const candidates = [];
        let el = startEl;

        while (el && el !== document.documentElement && el !== document.body) {
            const cs = getComputedStyle(el);
            const heightValue = cs.height;

            // Check if element has pixel height
            if (heightValue && heightValue !== 'auto' && heightValue.endsWith('px')) {
                const hasClass = el.className && typeof el.className === 'string' && el.className.trim();
                const hasScroll = cs.overflow === 'auto' || cs.overflow === 'scroll' ||
                    cs.overflowY === 'auto' || cs.overflowY === 'scroll';
                const scrollHeight = el.scrollHeight;
                const clientHeight = el.clientHeight;
                const hasScrollbar = scrollHeight > clientHeight + 1; // Has content overflow

                candidates.push({
                    element: el,
                    height: heightValue,
                    hasClass,
                    hasScroll,
                    hasScrollbar,
                    scrollHeight,
                    clientHeight,
                    className: el.className || el.tagName
                });
            }

            el = el.parentElement;
        }

        // Prioritize elements with scrollbars (overflow content)
        // These are the most likely candidates for expansion
        if (candidates.length > 0) {
            // First try: element with overflow:auto/scroll AND actual scrollbar
            const scrollable = candidates.find(c => c.hasScroll && c.hasScrollbar);
            if (scrollable) {
                console.log(`📦 Found scrollable container: ${scrollable.className} (${scrollable.height}, scroll: ${scrollable.scrollHeight}px)`);
                return scrollable.element;
            }

            // Second try: any element with overflow:auto/scroll (even without scrollbar yet)
            const overflowElement = candidates.find(c => c.hasScroll);
            if (overflowElement) {
                console.log(`📦 Found overflow container: ${overflowElement.className} (${overflowElement.height})`);
                return overflowElement.element;
            }

            // Fallback: closest element with fixed height (original behavior)
            const chosen = candidates[0];
            console.log(`📦 Found innermost element with fixed height: ${chosen.className} (${chosen.height})`);
            console.log(`   Total candidates: ${candidates.length}, chose closest to cursor`);
            return chosen.element;
        }

        // Fallback: semantic container search
        el = startEl;
        let depth = 0;
        const maxDepth = 15;

        while (el && el !== document.documentElement && el !== document.body && depth < maxDepth) {
            if (this._isSemanticContainer(el)) {
                console.log(`📦 Fallback: Found semantic container: ${el.className || el.tagName}`);
                return el;
            }
            el = el.parentElement;
            depth++;
        }

        // Last resort: startEl itself
        console.log(`📦 Last resort: Using startEl: ${startEl.className || startEl.tagName}`);
        return startEl;
    }

    /**
     * Check if element is a semantic container (modal, accordion, dialog, etc.)
     * @private
     */
    _isSemanticContainer(el) {
        // ARIA roles
        const role = el.getAttribute('role');
        if (role && /^(dialog|alertdialog|region|tabpanel|group)$/.test(role)) {
            return true;
        }

        // Common semantic class patterns
        const className = el.className || '';
        if (typeof className === 'string') {
            const semanticPatterns = [
                /modal-(body|content|dialog)/i,
                /dialog-(body|content)/i,
                /accordion-(body|content|collapse|panel)/i,
                /drawer-(body|content)/i,
                /popover-(body|content)/i,
                /dropdown-menu/i,
                /panel-(body|content)/i,
                /card-body/i,
                /tab-(pane|content)/i,
                /carousel-inner/i,
                /slick-list/i,         // slick-list = viewport (expand target)
                /slick-slider/i         // slick-slider = wrapper (NOT slick-track which is inner)
            ];
            if (semanticPatterns.some(pattern => pattern.test(className))) {
                return true;
            }
        }

        // Bootstrap/common component detection via data attributes
        if (el.hasAttribute('data-bs-target') || el.hasAttribute('data-toggle')) {
            return true;
        }

        return false;
    }

    /**
     * Apply CSS expansion to element + clear ancestor constraints
     * @param {Element} container
     * @returns {Object} snapshot of original styles for undo
     */
    apply(container) {
        const cs = getComputedStyle(container);
        const scrollbarWidth = container.offsetWidth - container.clientWidth -
            (parseFloat(cs.borderLeftWidth) || 0) -
            (parseFloat(cs.borderRightWidth) || 0);

        const originalStyles = {
            container: {
                height: container.style.height,
                maxHeight: container.style.maxHeight,
                overflow: container.style.overflow,
                overflowY: container.style.overflowY,
                paddingRight: container.style.paddingRight
            },
            ancestors: []
        };

        // Compensate for lost scrollbar width to prevent line breaks from shifting
        if (scrollbarWidth > 0) {
            const currentPaddingRight = parseFloat(cs.paddingRight) || 0;
            container.style.setProperty('padding-right', `${currentPaddingRight + scrollbarWidth}px`, 'important');
        }

        // Expand the container to its scroll height
        const targetHeight = container.scrollHeight;
        container.style.setProperty('height', `${targetHeight}px`, 'important');
        container.style.setProperty('max-height', 'none', 'important');
        container.style.setProperty('overflow', 'visible', 'important');

        // Walk up ancestors and adjust height constraints
        let ancestor = container.parentElement;
        let depth = 0;
        const maxDepth = 10;

        while (ancestor && ancestor !== document.documentElement && depth < maxDepth) {
            const cs = getComputedStyle(ancestor);
            const heightValue = cs.height;
            const hasPixelHeight = heightValue && heightValue !== 'auto' && heightValue.endsWith('px');
            const hasMaxHeight = cs.maxHeight !== 'none' && cs.maxHeight !== '';
            const hasOverflowClip = cs.overflow === 'hidden' || cs.overflowY === 'hidden';

            const needsClear = hasPixelHeight || hasMaxHeight || hasOverflowClip;

            if (needsClear) {
                // Measure ancestor scrollbar before clearing it
                const aSbWidth = ancestor.offsetWidth - ancestor.clientWidth -
                    (parseFloat(cs.borderLeftWidth) || 0) -
                    (parseFloat(cs.borderRightWidth) || 0);

                originalStyles.ancestors.push({
                    element: ancestor,
                    height: ancestor.style.height,
                    maxHeight: ancestor.style.maxHeight,
                    overflow: ancestor.style.overflow,
                    overflowY: ancestor.style.overflowY,
                    paddingRight: ancestor.style.paddingRight
                });

                // Compensate for lost scrollbar in ancestor
                if (aSbWidth > 0) {
                    const currentPaddingRight = parseFloat(cs.paddingRight) || 0;
                    ancestor.style.setProperty('padding-right', `${currentPaddingRight + aSbWidth}px`, 'important');
                }

                // Clear height constraints - use auto to allow natural growth
                if (hasPixelHeight || (heightValue !== 'auto' && heightValue !== '')) {
                    ancestor.style.setProperty('height', 'auto', 'important');
                }

                // Always clear max-height
                ancestor.style.setProperty('max-height', 'none', 'important');

                // Only clear overflow if element doesn't have border-radius (preserve styling)
                const hasBorderRadius = cs.borderRadius && cs.borderRadius !== '0px';
                if (hasOverflowClip && !hasBorderRadius) {
                    ancestor.style.setProperty('overflow', 'visible', 'important');
                }
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
        container.style.paddingRight = c.paddingRight;

        // Restore ancestor styles
        for (const a of saved.ancestors) {
            a.element.style.height = a.height;
            a.element.style.maxHeight = a.maxHeight;
            a.element.style.overflow = a.overflow;
            a.element.style.overflowY = a.overflowY;
            a.element.style.paddingRight = a.paddingRight;
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
        const { primary, fallbacks } = this.selectorEngine.getMultipleCandidates(container);
        const selector = primary || this.selectorEngine.getUniqueSelector(container);

        // Debug logging
        console.log(`🎯 EXPAND Target:`, {
            element: container,
            tagName: container.tagName,
            className: container.className,
            id: container.id,
            selector: selector,
            fallbackCount: fallbacks?.length || 0
        });

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
