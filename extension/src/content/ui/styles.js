/**
 * FlowCapture - Overlay Styles
 * Extracted from content.js:629-710
 * IMPROVEMENTS:
 * - Separated from UI logic for maintainability
 * - Added accessibility styles (focus-visible, contrast)
 * - Added prefers-reduced-motion support
 * - Click-to-expand (not just hover) for touch devices
 * - Button hover/active states
 */

import { CONFIG } from '../../shared/constants.js';

/**
 * Generates Shadow DOM styles for the overlay widget
 */
export class OverlayStyles {
    static getStyles() {
        return `
            /* ─── HOST ─────────────────────────────────────────────── */
            :host {
                font-family: 'Inter', system-ui, -apple-system, sans-serif;
                z-index: ${CONFIG.UI.OVERLAY_Z_INDEX};
                position: fixed;
                bottom: 20px;
                right: 20px;
                display: none;
            }
            :host(.visible) { display: block; }

            /* ─── RESET ────────────────────────────────────────────── */
            *, *::before, *::after {
                box-sizing: border-box;
                margin: 0;
                padding: 0;
            }

            /* ─── WIDGET CONTAINER ─────────────────────────────────── */
            .widget {
                background: rgba(15, 23, 42, 0.95);
                border: 1px solid rgba(59, 130, 246, 0.3);
                border-radius: 12px;
                box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.5);
                width: 300px;
                padding: 16px;
                color: #f8fafc;
                transition: all 0.3s ease;
                backdrop-filter: blur(10px);
            }

            /* ─── MINIMIZED STATE ──────────────────────────────────── */
            .widget.minimized {
                width: 48px;
                height: 48px;
                padding: 0;
                border-radius: 50%;
                overflow: hidden;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                border-color: rgba(239, 68, 68, 0.5);
            }

            .widget.minimized .full-ui { display: none; }
            .widget.minimized .mini-ui { display: flex; align-items: center; justify-content: center; }
            .widget:not(.minimized) .mini-ui { display: none; }

            /* ─── EXPAND ON HOVER ──────────────────────────────────── */
            .widget.minimized:hover,
            .widget.minimized.expanded {
                width: 300px;
                height: auto;
                padding: 16px;
                border-radius: 12px;
                border-color: rgba(59, 130, 246, 0.3);
            }
            .widget.minimized:hover .full-ui,
            .widget.minimized.expanded .full-ui { display: block; }
            .widget.minimized:hover .mini-ui,
            .widget.minimized.expanded .mini-ui { display: none; }

            /* ─── RECORDING DOT ────────────────────────────────────── */
            .recording-dot {
                width: 12px;
                height: 12px;
                background: #ef4444;
                border-radius: 50%;
                animation: pulse 2s infinite;
                flex-shrink: 0;
            }

            @keyframes pulse {
                0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
                70% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
                100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
            }

            /* ACCESSIBILITY: Respect motion preferences */
            @media (prefers-reduced-motion: reduce) {
                .recording-dot {
                    animation: none;
                    box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.4);
                }
                .widget {
                    transition: none;
                }
            }

            /* ─── HEADER ──────────────────────────────────────────── */
            .overlay-header {
                margin: 0 0 12px 0;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .overlay-title {
                font-size: 13px;
                font-weight: 600;
                color: #94a3b8;
                letter-spacing: 0.5px;
                text-transform: uppercase;
            }

            .btn-close {
                background: transparent;
                border: none;
                color: #64748b;
                cursor: pointer;
                font-size: 18px;
                width: 28px;
                height: 28px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 6px;
                transition: all 0.15s ease;
                line-height: 1;
            }
            .btn-close:hover {
                background: rgba(255, 255, 255, 0.1);
                color: #f8fafc;
            }

            /* ─── BUTTONS ─────────────────────────────────────────── */
            button {
                width: 100%;
                padding: 10px 12px;
                margin-top: 8px;
                border-radius: 8px;
                border: none;
                cursor: pointer;
                font-weight: 500;
                font-size: 13px;
                transition: all 0.15s ease;
                outline: none;
                font-family: inherit;
            }

            button:first-child { margin-top: 0; }

            .btn-primary {
                background: #3b82f6;
                color: white;
            }
            .btn-primary:hover { background: #2563eb; }
            .btn-primary:active { background: #1d4ed8; transform: scale(0.98); }

            .btn-danger {
                background: rgba(239, 68, 68, 0.15);
                color: #ef4444;
                border: 1px solid rgba(239, 68, 68, 0.3);
            }
            .btn-danger:hover {
                background: rgba(239, 68, 68, 0.25);
                border-color: rgba(239, 68, 68, 0.5);
            }
            .btn-danger:active { transform: scale(0.98); }

            .btn-secondary {
                background: rgba(255, 255, 255, 0.08);
                color: #cbd5e1;
            }
            .btn-secondary:hover {
                background: rgba(255, 255, 255, 0.15);
                color: white;
            }
            .btn-secondary:active { transform: scale(0.98); }

            .btn-capture {
                background: rgba(168, 85, 247, 0.15);
                color: #a855f7;
                border: 1px solid rgba(168, 85, 247, 0.3);
            }
            .btn-capture:hover {
                background: rgba(168, 85, 247, 0.25);
                border-color: rgba(168, 85, 247, 0.5);
            }
            .btn-capture:active { transform: scale(0.98); }

            .btn-success {
                background: rgba(34, 197, 94, 0.15);
                color: #22c55e;
                border: 1px solid rgba(34, 197, 94, 0.3);
            }
            .btn-success:hover {
                background: rgba(34, 197, 94, 0.25);
            }

            /* ACCESSIBILITY: Visible focus indicator */
            button:focus-visible,
            .btn-close:focus-visible {
                outline: 2px solid #3b82f6;
                outline-offset: 2px;
            }

            /* Button loading state */
            button.loading {
                opacity: 0.7;
                cursor: wait;
                pointer-events: none;
            }
            button.loading::after {
                content: '';
                display: inline-block;
                width: 12px;
                height: 12px;
                border: 2px solid transparent;
                border-top-color: currentColor;
                border-radius: 50%;
                animation: spin 0.6s linear infinite;
                margin-left: 8px;
                vertical-align: middle;
            }

            @keyframes spin {
                to { transform: rotate(360deg); }
            }

            /* ─── STATS ───────────────────────────────────────────── */
            .stats {
                display: flex;
                gap: 8px;
                margin-bottom: 10px;
            }

            .stat-box {
                flex: 1;
                background: rgba(0, 0, 0, 0.3);
                padding: 10px 8px;
                border-radius: 8px;
                text-align: center;
                border: 1px solid rgba(255, 255, 255, 0.05);
            }

            .stat-val {
                font-size: 18px;
                font-weight: 700;
                display: block;
                color: #f8fafc;
                font-variant-numeric: tabular-nums;
            }

            .stat-label {
                font-size: 10px;
                color: #64748b;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-top: 2px;
                display: block;
            }

            /* ─── TOAST NOTIFICATION ──────────────────────────────── */
            .toast {
                position: absolute;
                top: -40px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(15, 23, 42, 0.95);
                border: 1px solid rgba(59, 130, 246, 0.3);
                border-radius: 6px;
                padding: 6px 12px;
                font-size: 12px;
                color: #cbd5e1;
                white-space: nowrap;
                opacity: 0;
                transition: opacity 0.2s ease;
                pointer-events: none;
            }
            .toast.visible {
                opacity: 1;
            }
            .toast.success { border-color: rgba(34, 197, 94, 0.4); color: #22c55e; }
            .toast.error { border-color: rgba(239, 68, 68, 0.4); color: #ef4444; }

            /* ─── DIVIDER ─────────────────────────────────────────── */
            .divider {
                height: 1px;
                background: rgba(255, 255, 255, 0.06);
                margin: 10px 0;
            }

            /* ─── BADGE ───────────────────────────────────────────── */
            .recording-badge {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                background: rgba(239, 68, 68, 0.15);
                color: #ef4444;
                padding: 4px 10px;
                border-radius: 12px;
                font-size: 11px;
                font-weight: 600;
            }
            .recording-badge .dot {
                width: 6px;
                height: 6px;
                background: #ef4444;
                border-radius: 50%;
                animation: pulse-small 1.5s infinite;
            }

            @keyframes pulse-small {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.4; }
            }

            /* ─── SHORTCUTS INFO ──────────────────────────────────── */
            .shortcuts-info {
                margin: 10px 0;
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            .shortcut-row {
                display: flex;
                justify-content: space-between;
                font-size: 11px;
                color: #94a3b8;
                padding: 0 4px;
            }
            .key-combo {
                font-family: inherit; /* or monospaced could be nice */
                background: rgba(255, 255, 255, 0.1);
                padding: 1px 5px;
                border-radius: 4px;
                color: #e2e8f0;
                font-weight: 500;
                font-size: 10px;
                display: inline-block;
                min-width: 60px;
                text-align: center;
            }

            @media (prefers-reduced-motion: reduce) {
                .recording-badge .dot,
                button.loading::after {
                    animation: none;
                }
            }

            /* ─── EXPORT OPTIONS (post-recording) ────────────────── */
            #export-options {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }

            .export-label {
                font-size: 12px;
                color: #22c55e;
                font-weight: 600;
                text-align: center;
                margin-bottom: 4px;
            }

            .btn-export {
                width: 100%;
                padding: 8px 12px;
                border-radius: 6px;
                border: 1px solid rgba(255, 255, 255, 0.1);
                cursor: pointer;
                font-weight: 500;
                font-size: 12px;
                transition: all 0.15s ease;
                outline: none;
                font-family: inherit;
                text-align: left;
            }

            .btn-export-workflow {
                background: rgba(59, 130, 246, 0.15);
                color: #60a5fa;
                border-color: rgba(59, 130, 246, 0.3);
            }
            .btn-export-workflow:hover {
                background: rgba(59, 130, 246, 0.25);
            }

            .btn-export-intent {
                background: rgba(255, 255, 255, 0.05);
                color: #94a3b8;
                border-color: rgba(255, 255, 255, 0.08);
            }
            .btn-export-intent:hover {
                background: rgba(255, 255, 255, 0.1);
                color: #cbd5e1;
            }

            .btn-export-copy {
                background: rgba(168, 85, 247, 0.15);
                color: #a78bfa;
                border-color: rgba(168, 85, 247, 0.3);
            }
            .btn-export-copy:hover {
                background: rgba(168, 85, 247, 0.25);
            }
        `;
    }
}
