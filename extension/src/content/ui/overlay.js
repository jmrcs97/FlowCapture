/**
 * FlowCapture - Overlay UI
 * Extracted from content.js:606-868
 * IMPROVEMENTS:
 * - ARIA labels on all interactive elements
 * - Keyboard navigation (ESC to close, Tab trapping)
 * - Click-to-expand for touch devices
 * - Toast notifications for feedback
 * - Uses shared Timer class (eliminates duplication)
 * - Dependency injection (stateManager)
 * - Separated styles to styles.js
 */

import { Timer } from '../../shared/timer.js';
import { DownloadManager } from '../../shared/download.js';
import { StorageManager } from '../../shared/storage.js';
import { OverlayStyles } from './styles.js';
import { CONFIG } from '../../shared/constants.js';

/**
 * Overlay UI Widget - Injected into the page via Shadow DOM
 * Provides recording controls accessible during recording
 */
export class OverlayUI {
    /**
     * @param {StateManager} stateManager - Centralized state manager
     */
    constructor(stateManager) {
        this.stateManager = stateManager;
        this.timer = new Timer((formatted) => this._updateTimerDisplay(formatted));
        this.isVisible = false;
        this._isRecording = false;
        this._autoMinimize = true;

        // Create Shadow DOM container
        this.container = document.createElement('div');
        this.container.id = 'flow-capture-overlay-root';
        this.shadow = this.container.attachShadow({ mode: 'open' });

        this._render();
        document.body.appendChild(this.container);

        // Setup keyboard shortcuts
        this._setupKeyboardNav();
    }

    /**
     * Render overlay HTML into Shadow DOM
     * @private
     */
    _render() {
        // Inject styles
        const style = document.createElement('style');
        style.textContent = OverlayStyles.getStyles();
        this.shadow.appendChild(style);

        // Build widget
        const wrapper = document.createElement('div');
        wrapper.className = 'widget';
        wrapper.setAttribute('role', 'region');
        wrapper.setAttribute('aria-label', CONFIG.ACCESSIBILITY.OVERLAY_ARIA_LABEL);

        wrapper.innerHTML = `
            <div class="toast" id="toast" role="alert" aria-live="assertive"></div>

            <div class="mini-ui" aria-hidden="true">
                <div class="recording-dot" role="status" aria-label="Recording in progress"></div>
            </div>

            <div class="full-ui">
                <div class="overlay-header">
                    <span class="overlay-title">FlowCapture</span>
                    <button id="close-btn"
                            class="btn-close"
                            aria-label="Close overlay"
                            title="Close (Esc)">
                        ×
                    </button>
                </div>

                <div id="idle-view">
                    <button class="btn-primary"
                            id="btn-start"
                            aria-label="Start recording user interactions">
                        Start Recording
                    </button>
                    <div id="export-options" style="display:none">
                        <div class="export-label" id="export-label">Ready</div>
                        <button class="btn-export btn-export-workflow"
                                id="btn-dl-workflow"
                                aria-label="Download workflow IR">
                            Download Workflow
                        </button>
                        <button class="btn-export btn-export-intent"
                                id="btn-dl-intent"
                                aria-label="Download intent JSON">
                            Download Intent
                        </button>
                        <button class="btn-export btn-export-copy"
                                id="btn-copy-workflow"
                                aria-label="Copy workflow to clipboard">
                            Copy Workflow
                        </button>
                    </div>
                </div>

                <div id="rec-view" style="display:none" role="status" aria-live="polite">
                    <div class="recording-badge">
                        <span class="dot"></span>
                        REC
                    </div>
                    <div class="divider"></div>
                    <div class="stats">
                        <div class="stat-box">
                            <span class="stat-val" id="timer" aria-label="Recording duration">00:00</span>
                            <span class="stat-label">Time</span>
                        </div>
                        <div class="stat-box">
                            <span class="stat-val" id="count" aria-label="Steps captured">0</span>
                            <span class="stat-label">Steps</span>
                        </div>
                    </div>
                    <button class="btn-capture"
                            id="btn-mark-capture"
                            aria-label="Mark screenshot capture point (Ctrl+Shift+C)"
                            title="Ctrl+Shift+C">
                        📸 Mark Capture
                    </button>
                
                    <div class="shortcuts-info">
                        <div class="shortcut-row" title="Expand constrained element">
                            <span>Expand</span>
                            <span class="key-combo">Ctrl+Shift+E</span>
                        </div>
                        <div class="shortcut-row" title="Adjust expanded height">
                            <span>Height</span>
                            <span class="key-combo">Ctrl+Shift+↕</span>
                        </div>
                    </div>

                    <div class="divider"></div>

                    <button class="btn-danger"
                            id="btn-stop"
                            aria-label="Stop recording">
                        Stop Recording
                    </button>
                </div>
            </div>
        `;

        this.shadow.appendChild(wrapper);
        this.widget = wrapper;

        this._bindEvents(wrapper);
    }

    /**
     * Bind UI event handlers
     * @param {Element} w - Widget element
     * @private
     */
    _bindEvents(w) {
        // Close button
        w.querySelector('#close-btn').onclick = (e) => {
            e.stopPropagation();
            this.hide();
        };

        // Start recording (direct call - chrome.runtime.sendMessage doesn't reach own content script)
        w.querySelector('#btn-start').onclick = async () => {
            const btn = w.querySelector('#btn-start');
            btn.classList.add('loading');
            btn.textContent = 'Starting...';

            try {
                if (window.flowCapture) {
                    await window.flowCapture.startRecording();
                }
            } catch (error) {
                console.error('Failed to start recording from overlay:', error);
                btn.classList.remove('loading');
                btn.textContent = 'Start Recording';
                this.showToast('Failed to start', 'error');
            }
        };

        // Stop recording (direct call)
        w.querySelector('#btn-stop').onclick = async () => {
            const btn = w.querySelector('#btn-stop');
            btn.classList.add('loading');
            btn.textContent = 'Stopping...';

            try {
                if (window.flowCapture) {
                    await window.flowCapture.stopRecording();
                }
            } catch (error) {
                console.error('Failed to stop recording from overlay:', error);
                btn.classList.remove('loading');
                btn.textContent = 'Stop Recording';
                this.showToast('Failed to stop', 'error');
            }
        };

        // Mark Capture (screenshot placeholder)
        w.querySelector('#btn-mark-capture').onclick = () => {
            // Dispatch to FlowCapture content script
            if (window.flowCapture && window.flowCapture._triggerMarkCapture) {
                window.flowCapture._triggerMarkCapture();
            } else if (window.markCapture) {
                window.markCapture();
            }
            this.showToast('📸 Capture marked!', 'success');
        };

        // Hover to expand/minimize
        w.addEventListener('mouseenter', () => {
            if (this._isRecording) {
                this.widget.classList.remove('minimized');
            }
        });

        w.addEventListener('mouseleave', () => {
            if (this._isRecording && this._autoMinimize) {
                this.widget.classList.add('minimized');
            }
        });

        // Click to expand (for touch devices)
        w.addEventListener('click', (e) => {
            if (this._isRecording && this.widget.classList.contains('minimized')) {
                e.stopPropagation();
                this.widget.classList.toggle('expanded');
            }
        });

        // Click outside to minimize
        document.addEventListener('click', (e) => {
            if (this._isRecording && !this.container.contains(e.target)) {
                this.widget.classList.add('minimized');
                this.widget.classList.remove('expanded');
            }
        });
    }

    /**
     * Setup keyboard navigation
     * @private
     */
    _setupKeyboardNav() {
        // ESC to close overlay
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible) {
                this.hide();
            }
        });
    }

    /**
     * Update overlay UI state
     * @param {boolean} isRecording - Whether recording is active
     * @param {number} count - Event count
     */
    updateUI(isRecording, count) {
        this._isRecording = isRecording;
        const idle = this.shadow.querySelector('#idle-view');
        const rec = this.shadow.querySelector('#rec-view');

        if (isRecording) {
            idle.style.display = 'none';
            rec.style.display = 'block';
            this.widget.classList.add('minimized');
            this.widget.classList.remove('expanded');

            // Reset button states
            const stopBtn = this.shadow.querySelector('#btn-stop');
            stopBtn.classList.remove('loading');
            stopBtn.textContent = 'Stop Recording';
        } else {
            idle.style.display = 'block';
            rec.style.display = 'none';
            this.widget.classList.remove('minimized');
            this.widget.classList.remove('expanded');

            // Reset button states
            const startBtn = this.shadow.querySelector('#btn-start');
            startBtn.classList.remove('loading');
            startBtn.textContent = 'Start Recording';
        }

        this.updateCount(count);
    }

    /**
     * Update step count display
     * @param {number} n - Step count
     */
    updateCount(n) {
        const el = this.shadow.querySelector('#count');
        if (el) el.textContent = n;
    }

    /**
     * Update timer display
     * @param {string} formatted - Formatted time string
     * @private
     */
    _updateTimerDisplay(formatted) {
        const el = this.shadow.querySelector('#timer');
        if (el) el.textContent = formatted;
    }

    /**
     * Start the timer
     * @param {number} startTimestamp - Recording start timestamp
     */
    startTimer(startTimestamp) {
        this.timer.start(startTimestamp);
    }

    /**
     * Stop the timer
     */
    stopTimer() {
        this.timer.stop();
    }

    /**
     * Show export options after recording (matches popup dropdown)
     * @param {number} count - Step count
     */
    async showDownloadButton(count) {
        const exportOptions = this.shadow.querySelector('#export-options');
        if (!exportOptions) return;

        exportOptions.style.display = 'block';

        const label = this.shadow.querySelector('#export-label');
        if (label) label.textContent = `${count} steps recorded`;

        const settings = await StorageManager.getSettings();
        const screenshotMode = settings.screenshotMode || 'dynamic';
        const viewportPreset = settings.viewportPreset || 'desktop';

        // Download Workflow IR
        const dlWorkflow = this.shadow.querySelector('#btn-dl-workflow');
        if (dlWorkflow) {
            dlWorkflow.onclick = () => {
                const steps = this.stateManager.getSteps();
                const compilerOptions = { screenshotMode, viewportPreset };
                console.log('📱 Overlay: Creating workflow with options:', compilerOptions);
                const workflow = DownloadManager.createWorkflow(window.location.href, steps, compilerOptions);
                DownloadManager.downloadJSON(workflow, 'workflow_ir.json');
                this.showToast('Workflow downloaded!', 'success');
            };
        }

        // Download Intent (legacy)
        const dlIntent = this.shadow.querySelector('#btn-dl-intent');
        if (dlIntent) {
            dlIntent.onclick = () => {
                const steps = this.stateManager.getSteps();
                const intent = DownloadManager.createIntent(window.location.href, steps);
                DownloadManager.downloadJSON(intent, 'flow_capture_intent.json');
                this.showToast('Intent downloaded!', 'success');
            };
        }

        // Copy Workflow to clipboard
        const copyBtn = this.shadow.querySelector('#btn-copy-workflow');
        if (copyBtn) {
            copyBtn.onclick = async () => {
                const steps = this.stateManager.getSteps();
                const compilerOptions = { screenshotMode, viewportPreset };
                console.log('📱 Overlay: Copying workflow with options:', compilerOptions);
                const workflow = DownloadManager.createWorkflow(window.location.href, steps, compilerOptions);
                const success = await DownloadManager.copyToClipboard(workflow);
                this.showToast(success ? 'Copied to clipboard!' : 'Copy failed', success ? 'success' : 'error');
            };
        }
    }

    /**
     * Show toast notification
     * @param {string} message - Message to show
     * @param {string} type - 'success' | 'error' | 'info'
     * @param {number} duration - Duration in ms (default: 2000)
     */
    showToast(message, type = 'info', duration = 2000) {
        const toast = this.shadow.querySelector('#toast');
        if (!toast) return;

        // Clear existing classes
        toast.className = 'toast';

        toast.textContent = message;
        toast.classList.add(type, 'visible');

        // Auto-hide
        setTimeout(() => {
            toast.classList.remove('visible');
        }, duration);
    }

    /**
     * Show the overlay
     */
    show() {
        this.container.classList.add('visible');
        this.isVisible = true;
    }

    /**
     * Hide the overlay
     */
    hide() {
        this.container.classList.remove('visible');
        this.isVisible = false;
    }

    /**
     * Toggle overlay visibility
     */
    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    /**
     * Restore state from storage (for page reload)
     */
    async restoreState() {
        try {
            const state = await StorageManager.getRecordingState();

            if (state.isRecording) {
                this.updateUI(true, state.eventCount || 0);

                if (state.startTime) {
                    this.startTimer(state.startTime);
                }

                this.show();
            }
        } catch (error) {
            console.error('OverlayUI: Failed to restore state:', error);
        }
    }

    /**
     * Set auto-minimize behavior
     * @param {boolean} enabled
     */
    setAutoMinimize(enabled) {
        this._autoMinimize = enabled;
    }

    /**
     * Show/hide the recording dot in minimized mode
     * @param {boolean} visible
     */
    setRecordingIndicatorVisible(visible) {
        const miniUI = this.shadow.querySelector('.mini-ui');
        if (miniUI) {
            miniUI.style.display = visible ? '' : 'none';
        }
    }

    /**
     * Update the shortcut display on the Mark Capture button
     * @param {string} shortcutText - e.g. "Ctrl+Shift+C"
     */
    updateShortcutDisplay(shortcutText) {
        const btn = this.shadow.querySelector('#btn-mark-capture');
        if (btn) {
            btn.setAttribute('title', shortcutText);
            btn.setAttribute('aria-label', `Mark screenshot capture point (${shortcutText})`);
        }
    }

    /**
     * Destroy overlay and clean up
     */
    destroy() {
        this.timer.stop();
        this.container.remove();
    }
}
