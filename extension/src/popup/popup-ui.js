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
            downloadBtnText: document.getElementById('download-btn-text'),
            downloadDropdown: document.getElementById('download-dropdown'),
            markCaptureBtn: document.getElementById('mark-capture-btn'),
            stateIdle: document.getElementById('state-idle'),
            stateRecording: document.getElementById('state-recording'),
            stateSettings: document.getElementById('state-settings'),
            timerDisplay: document.getElementById('timer'),
            eventCountDisplay: document.getElementById('event-count'),
            toast: document.getElementById('toast'),
            settingsBtn: document.getElementById('settings-btn'),
            settingsBackBtn: document.getElementById('settings-back-btn'),
            shortcutBtn: document.getElementById('shortcut-btn'),
            shortcutDisplay: document.getElementById('shortcut-display'),
            expandShortcutBtn: document.getElementById('expand-shortcut-btn'),
            expandShortcutDisplay: document.getElementById('expand-shortcut-display'),
            exportFormatSelect: document.getElementById('export-format-select'),
            autoMinimizeToggle: document.getElementById('auto-minimize-toggle'),
            recordingIndicatorToggle: document.getElementById('recording-indicator-toggle'),
            manualExpandStepInput: document.getElementById('manual-expand-step'),
            screenshotModeGroup: document.getElementById('screenshot-mode-group'),
            copyBtn: document.getElementById('copy-btn'),
            copySettingBtn: document.getElementById('copy-setting-btn')
        };

        this._setupDropdownBehavior();
    }

    /**
     * Setup dropdown toggle behavior
     * @private
     */
    _setupDropdownBehavior() {
        if (!this.el.downloadBtn || !this.el.downloadDropdown) return;

        // Toggle dropdown on main button click
        this.el.downloadBtn.addEventListener('click', (e) => {
            if (this.el.downloadBtn.classList.contains('disabled')) return;

            e.stopPropagation();
            this.toggleDropdown();
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.el.downloadBtn.contains(e.target) &&
                !this.el.downloadDropdown.contains(e.target)) {
                this.closeDropdown();
            }
        });

        // Keyboard navigation within dropdown
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeDropdown();
                this.el.downloadBtn.focus();
                return;
            }

            if (!this.el.downloadDropdown.classList.contains('visible')) return;

            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const items = [...this.el.downloadDropdown.querySelectorAll('.dropdown-item')];
                if (!items.length) return;
                const currentIndex = items.indexOf(document.activeElement);
                const nextIndex = e.key === 'ArrowDown'
                    ? (currentIndex < items.length - 1 ? currentIndex + 1 : 0)
                    : (currentIndex > 0 ? currentIndex - 1 : items.length - 1);
                items[nextIndex].focus();
            }
        });
    }

    /**
     * Toggle dropdown visibility
     */
    toggleDropdown() {
        const isVisible = this.el.downloadDropdown.classList.contains('visible');

        if (isVisible) {
            this.closeDropdown();
        } else {
            this.openDropdown();
        }
    }

    /**
     * Open dropdown menu
     */
    openDropdown() {
        this.el.downloadDropdown.classList.add('visible');
        this.el.downloadDropdown.removeAttribute('aria-hidden'); // Remove completely to avoid conflicts
        this.el.downloadBtn.setAttribute('aria-expanded', 'true');

        // Move focus to first item for keyboard navigation, after DOM update
        requestAnimationFrame(() => {
            const firstItem = this.el.downloadDropdown.querySelector('.dropdown-item');
            if (firstItem) firstItem.focus();
        });
    }

    /**
     * Close dropdown menu
     */
    closeDropdown() {
        this.el.downloadDropdown.classList.remove('visible');
        this.el.downloadDropdown.setAttribute('aria-hidden', 'true');
        this.el.downloadBtn.setAttribute('aria-expanded', 'false');
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

            if (this.el.markCaptureBtn) {
                this.el.markCaptureBtn.disabled = false;
            }

            // ACCESSIBILITY: Update ARIA states
            this.el.stateRecording.setAttribute('aria-busy', 'true');
            this.el.startBtn.setAttribute('aria-pressed', 'true');
        } else {
            this.el.stateIdle.style.display = 'flex';
            this.el.stateRecording.style.display = 'none';
            this.el.startBtn.disabled = false;

            if (this.el.markCaptureBtn) {
                this.el.markCaptureBtn.disabled = true;
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
        if (!this.el.downloadBtn || !this.el.downloadBtnText) return;

        this.el.downloadBtn.classList.remove('disabled');
        this.el.downloadBtn.setAttribute('aria-disabled', 'false');
        this.el.downloadBtnText.textContent = `Download (${count} steps)`;
        this.el.downloadBtn.setAttribute('aria-label', `Download ${count} recorded steps`);
    }

    /**
     * Disable download button
     */
    disableDownload() {
        if (!this.el.downloadBtn || !this.el.downloadBtnText) return;

        this.el.downloadBtn.classList.add('disabled');
        this.el.downloadBtn.setAttribute('aria-disabled', 'true');
        this.el.downloadBtnText.textContent = 'Download Result';
        this.closeDropdown();
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
    onMarkCaptureClick(handler) {
        if (this.el.markCaptureBtn) {
            this.el.markCaptureBtn.addEventListener('click', handler);
        }
    }

    /**
     * Register handler for download format selection
     * @param {Function} handler - Called with format ('intent' or 'workflow')
     */
    onDownloadFormatClick(handler) {
        if (!this.el.downloadDropdown) return;

        const items = this.el.downloadDropdown.querySelectorAll('.dropdown-item');
        items.forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const format = item.getAttribute('data-format');
                if (format) {
                    handler(format);
                    this.closeDropdown();
                }
            });
        });
    }

    /**
     * @param {Function} handler
     */
    onCopyClick(handler) {
        if (this.el.copyBtn) {
            this.el.copyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                handler();
                this.closeDropdown();
            });
        }
    }

    /**
     * @param {Function} handler
     */
    onCopySettingClick(handler) {
        if (this.el.copySettingBtn) {
            this.el.copySettingBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                handler();
            });
        }
    }

    // ─── Settings View ───────────────────────────────────

    /**
     * Show settings view, hide other views
     */
    showSettings() {
        this.el.stateIdle.style.display = 'none';
        this.el.stateRecording.style.display = 'none';
        this.el.stateSettings.style.display = 'flex';
    }

    /**
     * Hide settings view, restore appropriate view
     * @param {boolean} isRecording
     * @param {number} eventCount
     */
    hideSettings(isRecording, eventCount = 0) {
        this.el.stateSettings.style.display = 'none';
        this.updateState(isRecording, eventCount);
    }

    /**
     * @returns {boolean}
     */
    isSettingsVisible() {
        return this.el.stateSettings.style.display !== 'none';
    }

    /**
     * Populate settings UI with current values
     * @param {Object} settings
     */
    populateSettings(settings) {
        if (this.el.shortcutDisplay) {
            this.el.shortcutDisplay.textContent = this._formatShortcut(settings.captureShortcut);
        }
        if (this.el.expandShortcutDisplay) {
            this.el.expandShortcutDisplay.textContent = this._formatShortcut(settings.expandShortcut);
        }
        if (this.el.exportFormatSelect) {
            this.el.exportFormatSelect.value = settings.defaultExportFormat;
        }
        if (this.el.autoMinimizeToggle) {
            this.el.autoMinimizeToggle.checked = settings.autoMinimizeOverlay;
        }
        if (this.el.recordingIndicatorToggle) {
            this.el.recordingIndicatorToggle.checked = settings.showRecordingIndicator;
        }
        if (this.el.manualExpandStepInput) {
            this.el.manualExpandStepInput.value = settings.manualExpandStep || 50;
        }
        if (this.el.screenshotModeGroup) {
            const radio = this.el.screenshotModeGroup.querySelector(`input[value="${settings.screenshotMode}"]`);
            if (radio) radio.checked = true;
        }
    }

    /**
     * Format shortcut object to display string
     * @param {Object} shortcut - { ctrl, shift, alt, meta, key }
     * @returns {string}
     */
    _formatShortcut(shortcut) {
        if (!shortcut) return 'Ctrl+Shift+C';
        const parts = [];
        if (shortcut.ctrl) parts.push('Ctrl');
        if (shortcut.shift) parts.push('Shift');
        if (shortcut.alt) parts.push('Alt');
        if (shortcut.meta) parts.push('Meta');
        parts.push(shortcut.key.toUpperCase());
        return parts.join('+');
    }

    /**
     * Toggle shortcut recording mode
     * @param {boolean} isRecording
     */
    setShortcutRecording(isRecording) {
        if (!this.el.shortcutBtn) return;
        if (isRecording) {
            this.el.shortcutBtn.classList.add('recording');
            this.el.shortcutDisplay.textContent = 'Press keys...';
        } else {
            this.el.shortcutBtn.classList.remove('recording');
        }
    }

    /**
     * Toggle expand shortcut recording mode
     * @param {boolean} isRecording
     */
    setExpandShortcutRecording(isRecording) {
        if (!this.el.expandShortcutBtn) return;
        if (isRecording) {
            this.el.expandShortcutBtn.classList.add('recording');
            this.el.expandShortcutDisplay.textContent = 'Press keys...';
        } else {
            this.el.expandShortcutBtn.classList.remove('recording');
        }
    }

    /**
     * Update expand shortcut display text
     * @param {Object} shortcut
     */
    updateExpandShortcutDisplay(shortcut) {
        if (this.el.expandShortcutDisplay) {
            this.el.expandShortcutDisplay.textContent = this._formatShortcut(shortcut);
        }
    }

    /**
     * Update shortcut display text
     * @param {Object} shortcut
     */
    updateShortcutDisplay(shortcut) {
        if (this.el.shortcutDisplay) {
            this.el.shortcutDisplay.textContent = this._formatShortcut(shortcut);
        }
    }

    // ─── Settings Event Registrations ────────────────────

    /** @param {Function} handler */
    onSettingsClick(handler) {
        if (this.el.settingsBtn) this.el.settingsBtn.addEventListener('click', handler);
    }

    /** @param {Function} handler */
    onSettingsBackClick(handler) {
        if (this.el.settingsBackBtn) this.el.settingsBackBtn.addEventListener('click', handler);
    }

    /** @param {Function} handler */
    onShortcutRecordClick(handler) {
        if (this.el.shortcutBtn) this.el.shortcutBtn.addEventListener('click', handler);
    }

    /** @param {Function} handler */
    onExpandShortcutRecordClick(handler) {
        if (this.el.expandShortcutBtn) this.el.expandShortcutBtn.addEventListener('click', handler);
    }

    /** @param {Function} handler */
    onExportFormatChange(handler) {
        if (this.el.exportFormatSelect) {
            this.el.exportFormatSelect.addEventListener('change', (e) => handler(e.target.value));
        }
    }

    /** @param {Function} handler */
    onAutoMinimizeChange(handler) {
        if (this.el.autoMinimizeToggle) {
            this.el.autoMinimizeToggle.addEventListener('change', (e) => handler(e.target.checked));
        }
    }

    /** @param {Function} handler */
    onRecordingIndicatorChange(handler) {
        if (this.el.recordingIndicatorToggle) {
            this.el.recordingIndicatorToggle.addEventListener('change', (e) => handler(e.target.checked));
        }
    }

    /** @param {Function} handler */
    onManualExpandStepChange(handler) {
        if (this.el.manualExpandStepInput) {
            this.el.manualExpandStepInput.addEventListener('change', (e) => handler(parseInt(e.target.value) || 50));
        }
    }

    /** @param {Function} handler - Called with 'dynamic' | 'fullpage' | 'viewport' */
    onScreenshotModeChange(handler) {
        if (this.el.screenshotModeGroup) {
            this.el.screenshotModeGroup.addEventListener('change', (e) => {
                if (e.target.type === 'radio') handler(e.target.value);
            });
        }
    }
}
