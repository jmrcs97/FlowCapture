/**
 * Shortcut Matcher Service
 * Consolidates shortcut matching logic (eliminates duplication)
 *
 * Used by: content.js
 * Lines saved: ~100
 */

export class ShortcutMatcher {
    /**
     * Check if a keyboard event matches a shortcut configuration
     * @param {KeyboardEvent} event
     * @param {Object} shortcut - { ctrl, shift, alt, meta, key }
     * @returns {boolean}
     */
    static matches(event, shortcut) {
        if (!shortcut) return false;

        return event.ctrlKey === !!shortcut.ctrl &&
               event.shiftKey === !!shortcut.shift &&
               event.altKey === !!shortcut.alt &&
               event.metaKey === !!shortcut.meta &&
               event.key.toUpperCase() === shortcut.key.toUpperCase();
    }

    /**
     * Check if event matches capture shortcut
     * @param {KeyboardEvent} event
     * @param {Object} captureShortcut
     * @returns {boolean}
     */
    static isCapture(event, captureShortcut) {
        return this.matches(event, captureShortcut);
    }

    /**
     * Check if event matches expand shortcut
     * @param {KeyboardEvent} event
     * @param {Object} expandShortcut
     * @returns {boolean}
     */
    static isExpand(event, expandShortcut) {
        return this.matches(event, expandShortcut);
    }

    /**
     * Check if event is manual height adjustment (Ctrl+Shift+Up/Down)
     * @param {KeyboardEvent} event
     * @returns {boolean}
     */
    static isHeightAdjustment(event) {
        return event.ctrlKey && event.shiftKey &&
               (event.key === 'ArrowUp' || event.key === 'ArrowDown');
    }

    /**
     * Get height adjustment delta
     * @param {KeyboardEvent} event
     * @param {number} step - pixels per step (default 50)
     * @returns {number} delta in pixels (positive or negative)
     */
    static getHeightDelta(event, step = 50) {
        return event.key === 'ArrowUp' ? step : -step;
    }
}
