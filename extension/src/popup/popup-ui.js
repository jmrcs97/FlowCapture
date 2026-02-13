/**
 * FlowCapture - Popup UI Manager
 * NEW MODULE: Separates UI logic from business logic
 * IMPROVEMENTS:
 * - Clean event delegation
 * - ARIA state management
 * - Toast notifications (no more alert())
 * - Loading states for buttons
 */

/**
 * Popup UI Manager - Handles all visual state updates
 */
export class PopupUI {
    constructor() {
        // Cache DOM references
        this.el = {
            startBtn: document.getElementById('start-btn'),
            stopBtn: document.getElementById('stop-btn'),
            downloadBtn: document.getElementById('download-btn'),
            cameraBtn: document.getElementById('camera-btn'),
            stateIdle: document.getElementById('state-idle'),
            stateRecording: document.getElementById('state-recording'),
            timerDisplay: document.getElementById('timer'),
            eventCountDisplay: document.getElementById('event-count'),
            toast: document.getElementById('toast')
        };
    }

    /**
     * Update UI for recording/idle state
     * @param {boolean} isRecording - Whether recording is active
     * @param {number} eventCount - Number of events captured
     */
    updateState(isRecording, eventCount = 0) {
        if (isRecording) {
            this.el.stateIdle.style.display = 'none';
            this.el.stateRecording.style.display = 'flex';
            this.el.startBtn.disabled = true;
            this.el.downloadBtn.classList.add('disabled');

            if (this.el.cameraBtn) {
                this.el.cameraBtn.disabled = false;
            }

            // ACCESSIBILITY: Update ARIA states
            this.el.stateRecording.setAttribute('aria-busy', 'true');
            this.el.startBtn.setAttribute('aria-pressed', 'true');
        } else {
            this.el.stateIdle.style.display = 'flex';
            this.el.stateRecording.style.display = 'none';
            this.el.startBtn.disabled = false;

            if (this.el.cameraBtn) {
                this.el.cameraBtn.disabled = true;
            }

            // ACCESSIBILITY
            this.el.stateRecording.setAttribute('aria-busy', 'false');
            this.el.startBtn.setAttribute('aria-pressed', 'false');
        }

        this.updateEventCount(eventCount);
        this._resetButtonStates();
    }

    /**
     * Update event count display
     * @param {number} count
     */
    updateEventCount(count) {
        if (this.el.eventCountDisplay) {
            this.el.eventCountDisplay.textContent = count;
            this.el.eventCountDisplay.setAttribute('aria-label', `${count} events captured`);
        }
    }

    /**
     * Update timer display
     * @param {string} formatted - Formatted time string
     */
    updateTimer(formatted) {
        if (this.el.timerDisplay) {
            this.el.timerDisplay.textContent = formatted;
        }
    }

    /**
     * Enable download button
     * @param {number} count - Step count
     */
    enableDownload(count) {
        if (!this.el.downloadBtn) return;

        this.el.downloadBtn.classList.remove('disabled');
        this.el.downloadBtn.innerHTML = `
            <span class="material-icons-round" aria-hidden="true">download</span>
            <span>Download Intent (${count} steps)</span>
        `;
        this.el.downloadBtn.setAttribute('aria-label', `Download ${count} recorded steps`);
    }

    /**
     * Disable download button
     */
    disableDownload() {
        if (!this.el.downloadBtn) return;

        this.el.downloadBtn.classList.add('disabled');
        this.el.downloadBtn.innerHTML = `
            <span class="material-icons-round" aria-hidden="true">download</span>
            <span>Download Result</span>
        `;
    }

    /**
     * Show loading state on start button
     */
    setStartLoading() {
        this.el.startBtn.classList.add('loading');
        this.el.startBtn.disabled = true;
    }

    /**
     * Show loading state on stop button
     */
    setStopLoading() {
        this.el.stopBtn.classList.add('loading');
        this.el.stopBtn.disabled = true;
    }

    /**
     * Reset all button loading states
     * @private
     */
    _resetButtonStates() {
        this.el.startBtn.classList.remove('loading');
        this.el.stopBtn.classList.remove('loading');
        this.el.startBtn.disabled = false;
        this.el.stopBtn.disabled = false;
    }

    /**
     * Show toast notification (replaces alert())
     * @param {string} message - Message text
     * @param {string} type - 'success' | 'error' | 'info'
     * @param {number} duration - Duration in ms
     */
    showToast(message, type = 'info', duration = 2500) {
        const toast = this.el.toast;
        if (!toast) return;

        toast.className = 'toast';
        toast.textContent = message;
        toast.classList.add(type, 'visible');

        // Auto-hide
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => {
            toast.classList.remove('visible');
        }, duration);
    }

    /**
     * Show error message (replaces alert())
     * @param {string} message
     */
    showError(message) {
        this.showToast(message, 'error', 3500);
    }

    /**
     * Show success message
     * @param {string} message
     */
    showSuccess(message) {
        this.showToast(message, 'success', 2000);
    }

    // ─── Event Handler Registration ──────────────────────

    /**
     * @param {Function} handler
     */
    onStartClick(handler) {
        this.el.startBtn.addEventListener('click', handler);
    }

    /**
     * @param {Function} handler
     */
    onStopClick(handler) {
        this.el.stopBtn.addEventListener('click', handler);
    }

    /**
     * @param {Function} handler
     */
    onCheckpointClick(handler) {
        if (this.el.cameraBtn) {
            this.el.cameraBtn.addEventListener('click', handler);
        }
    }

    /**
     * @param {Function} handler
     */
    onDownloadClick(handler) {
        this.el.downloadBtn.addEventListener('click', handler);
    }
}
