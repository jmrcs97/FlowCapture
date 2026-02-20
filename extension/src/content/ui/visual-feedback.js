/**
 * Visual Feedback Service
 * Handles all visual feedback for user actions (icons, outlines, animations)
 * Extracted from content.js to improve testability and maintainability
 *
 * Usage:
 * const feedback = new VisualFeedback();
 * feedback.showActionIcon('capture');
 * feedback.showElementOutline(el, 'success');
 */

export class VisualFeedback {
    constructor() {
        this._animationsInitialized = false;
    }

    /**
     * Initialize animation styles once (called in init)
     * Prevents re-adding CSS on every call
     */
    initializeAnimations() {
        if (this._animationsInitialized) return;

        const style = document.createElement('style');
        style.id = 'fc-feedback-animations';
        style.textContent = `
            @keyframes fc-icon-fade {
                0% { opacity: 1; transform: translateX(-50%) translateY(0); }
                70% { opacity: 1; }
                100% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
            }
        `;
        document.head.appendChild(style);
        this._animationsInitialized = true;
    }

    /**
     * Show floating action icon above viewport (📸 📐 ⬆️ ⬇️)
     * @param {string} iconType - 'capture' | 'expand' | 'adjust-up' | 'adjust-down'
     */
    showActionIcon(iconType) {
        this.initializeAnimations();

        const icons = {
            'capture': '📸',
            'expand': '📐',
            'adjust-up': '⬆️',
            'adjust-down': '⬇️'
        };

        const icon = icons[iconType] || '✓';

        const iconEl = document.createElement('div');
        iconEl.textContent = icon;
        iconEl.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            font-size: 48px;
            background: rgba(0, 0, 0, 0.8);
            padding: 16px 24px;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
            z-index: 2147483646;
            pointer-events: none;
            animation: fc-icon-fade 2s ease-out forwards;
        `;

        document.body.appendChild(iconEl);

        // Auto-remove after animation
        setTimeout(() => iconEl.remove(), 2000);
    }

    /**
     * Show element outline feedback (green/red/amber outline)
     * @param {Element} el
     * @param {string} state - 'success' | 'error' | 'undo'
     */
    showElementOutline(el, state = 'success') {
        if (!el) return;

        const origOutline = el.style.outline;
        const origTransition = el.style.transition;

        const colors = {
            'success': '#22c55e',   // green
            'error': '#ef4444',     // red
            'undo': '#f59e0b'       // amber
        };

        el.style.outline = `3px solid ${colors[state] || colors.success}`;
        el.style.transition = 'outline 0.3s ease';

        setTimeout(() => {
            el.style.outline = origOutline;
            el.style.transition = origTransition;
        }, 1500);
    }

    /**
     * Show toast notification (delegated to overlay)
     * This method signature is compatible with content.js usage
     * @param {Element} overlay - the overlay instance
     * @param {string} message
     * @param {string} type - 'success' | 'error' | 'info'
     * @param {number} duration
     */
    static showToast(overlay, message, type = 'info', duration = 2500) {
        if (overlay && overlay.showToast) {
            overlay.showToast(message, type, duration);
        }
    }
}
