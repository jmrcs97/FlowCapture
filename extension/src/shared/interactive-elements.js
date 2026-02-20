/**
 * Interactive Elements Constants
 * Single source of truth for interactive HTML elements and ARIA roles
 *
 * Used by:
 * - selector-engine.js (ancestor bubbling)
 * - content.js (event filtering)
 * - Any module that needs to detect interactive elements
 *
 * This eliminates duplication across multiple modules.
 */

export const INTERACTIVE_ELEMENTS = {
    /**
     * Native HTML tags that are clickable/interactive
     */
    tags: new Set([
        'BUTTON',
        'A',
        'INPUT',
        'SELECT',
        'TEXTAREA',
        'SUMMARY',
        'DETAILS'
    ]),

    /**
     * ARIA roles that indicate interactive elements
     */
    roles: new Set([
        'button',
        'link',
        'tab',
        'checkbox',
        'radio',
        'menuitem',
        'option',
        'combobox',
        'switch',
        'menuitemcheckbox',
        'menuitemradio',
        'treeitem',
        'gridcell'
    ]),

    /**
     * Check if element is interactive
     * @param {Element} el
     * @returns {boolean}
     */
    isInteractive(el) {
        if (!el) return false;

        // Check native tags
        if (this.tags.has(el.tagName)) return true;

        // Check ARIA roles
        const role = el.getAttribute('role');
        if (role && this.roles.has(role)) return true;

        // Check onclick handler
        if (el.hasAttribute('onclick')) return true;

        // Check tabindex=0 (keyboard accessible)
        if (el.getAttribute('tabindex') === '0') return true;

        return false;
    },

    /**
     * Find nearest interactive ancestor (for click target resolution)
     * @param {Element} el
     * @param {Element} boundary - stop at this element (default: body)
     * @returns {Element} nearest interactive ancestor or original element
     */
    findInteractiveAncestor(el, boundary = document.body) {
        if (this.isInteractive(el)) return el;

        let current = el.parentElement;
        while (current && current !== boundary) {
            if (this.isInteractive(current)) return current;
            current = current.parentElement;
        }

        return el; // No interactive ancestor found
    }
};

/**
 * Semantic HTML tags (used for content extraction in selectors)
 */
export const SEMANTIC_TAGS = new Set([
    'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'BUTTON', 'A', 'LABEL',
    'LI', 'TH', 'TD', 'P',
    'SUMMARY', 'LEGEND', 'CAPTION',
    'DT', 'DD', 'OPTION', 'FIGCAPTION'
]);

/**
 * Form input tags
 */
export const FORM_INPUT_TAGS = new Set([
    'INPUT',
    'TEXTAREA',
    'SELECT'
]);
