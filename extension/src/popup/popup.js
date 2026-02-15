/**
 * FlowCapture - Popup Controller
 * REFACTORED: Callbacks → async/await, separated UI logic
 * IMPROVEMENTS:
 * - All Chrome APIs wrapped in async/await (no callback hell)
 * - Error handling with user-friendly toast messages (no alert())
 * - Uses shared Timer module (eliminates duplication)
 * - Clean separation: PopupUI handles visuals, Controller handles logic
 */

import { PopupUI } from './popup-ui.js';
import { Timer } from '../shared/timer.js';
import { StorageManager } from '../shared/storage.js';
import { DownloadManager } from '../shared/download.js';
import { MESSAGE_ACTIONS, DEFAULT_SETTINGS } from '../shared/constants.js';

// ─── Chrome API Async Helpers ──────────────────────────

/**
 * Query active tab
 * @returns {Promise<chrome.tabs.Tab|null>}
 */
async function getActiveTab() {
    return new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            resolve(tabs?.[0] || null);
        });
    });
}

/**
 * Send message to tab with retry logic
 * @param {number} tabId
 * @param {Object} message
 * @param {number} retries
 * @returns {Promise<Object>}
 */
async function sendTabMessage(tabId, message, retries = 0) {
    return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, message, (response) => {
            if (chrome.runtime.lastError) {
                const error = chrome.runtime.lastError.message;
                // If the content script isn't loaded yet, we could try to inject it
                // but for now we just handle the error gracefully
                reject(new Error(error));
            } else {
                resolve(response);
            }
        });
    });
}

// ─── Popup Controller ─────────────────────────────────

class PopupController {
    constructor() {
        this.ui = new PopupUI();
        this.timer = new Timer((formatted) => this.ui.updateTimer(formatted));
        this._settings = { ...DEFAULT_SETTINGS };
        this._isRecordingShortcut = false;
        this._shortcutListener = null;

        this._init();
    }

    /**
     * Initialize popup state and event handlers
     */
    async _init() {
        try {
            // Register event handlers first
            this._setupHandlers();

            // Restore state from storage
            const state = await StorageManager.getRecordingState();

            if (state.isRecording) {
                this.ui.updateState(true, state.eventCount || 0);
                if (state.startTime) {
                    this.timer.start(state.startTime);
                }
            } else if (state.eventCount > 0) {
                this.ui.updateState(false, state.eventCount);
                this.ui.enableDownload(state.eventCount);
            }

            // Load settings
            this._settings = await StorageManager.getSettings();
            const shortcutBadge = document.querySelector('.shortcut-badge');
            if (shortcutBadge) {
                shortcutBadge.textContent = this.ui._formatShortcut(this._settings.captureShortcut);
            }

            // Listen for real-time updates from content script
            this._setupMessageListener();
        } catch (error) {
            console.error('Popup initialization failed:', error);
            this.ui.showError('Failed to load extension state');
        }
    }

    /**
     * Setup button click handlers
     */
    _setupHandlers() {
        this.ui.onStartClick(() => this._handleStart());
        this.ui.onStopClick(() => this._handleStop());
        this.ui.onMarkCaptureClick(() => this._handleMarkCapture());
        this.ui.onDownloadFormatClick((format) => this._handleDownload(format));

        // Settings handlers
        this.ui.onSettingsClick(() => this._handleOpenSettings());
        this.ui.onSettingsBackClick(() => this._handleCloseSettings());
        this.ui.onShortcutRecordClick(() => this._handleShortcutRecord());
        this.ui.onExportFormatChange((format) => this._handleSettingChange('defaultExportFormat', format));
        this.ui.onAutoMinimizeChange((val) => this._handleSettingChange('autoMinimizeOverlay', val));
        this.ui.onRecordingIndicatorChange((val) => this._handleSettingChange('showRecordingIndicator', val));
        this.ui.onScreenshotModeChange((mode) => this._handleSettingChange('screenshotMode', mode));
    }

    /**
     * Listen for messages from content script
     */
    _setupMessageListener() {
        chrome.runtime.onMessage.addListener((msg) => {
            if (msg.action === MESSAGE_ACTIONS.INTENT_UPDATED) {
                this.ui.updateEventCount(msg.count);
                StorageManager.updateEventCount(msg.count).catch(console.error);
            }
        });
    }

    /**
     * Handle Start Recording
     */
    async _handleStart() {
        this.ui.setStartLoading();

        try {
            const tab = await getActiveTab();
            if (!tab) {
                this.ui.showError('No active tab found');
                this.ui.updateState(false);
                return;
            }

            // Don't record on chrome:// pages
            if (tab.url?.startsWith('chrome://')) {
                this.ui.showError('Recording is not allowed on Chrome system pages');
                this.ui.updateState(false);
                return;
            }

            const now = Date.now();
            await StorageManager.setRecordingState(true, now, 0);

            const response = await sendTabMessage(tab.id, { action: MESSAGE_ACTIONS.START_RECORDING });

            if (response?.status === 'started') {
                this.ui.updateState(true, 0);
                this.timer.start(now);
            }
        } catch (error) {
            console.error('Start recording failed:', error);

            if (error.message?.includes('Could not establish connection') ||
                error.message?.includes('Receiving end does not exist')) {
                this.ui.showError('Please refresh the page before recording.');
            } else {
                this.ui.showError('Failed to start recording: ' + error.message);
            }

            await StorageManager.setRecordingState(false);
            this.ui.updateState(false);
        }
    }

    /**
     * Handle Stop Recording
     */
    async _handleStop() {
        this.ui.setStopLoading();

        try {
            const tab = await getActiveTab();
            if (!tab) return;

            const response = await sendTabMessage(tab.id, { action: MESSAGE_ACTIONS.STOP_RECORDING });
            const count = response?.count || 0;

            await StorageManager.setRecordingState(false, null, count);

            this.timer.stop();
            this.ui.updateState(false, count);

            if (count > 0) {
                this.ui.enableDownload(count);
                this.ui.showSuccess(`Recorded ${count} steps`);
            }
        } catch (error) {
            console.error('Stop recording failed:', error);

            // Force UI reset
            await StorageManager.setRecordingState(false);
            this.timer.stop();
            this.ui.updateState(false, 0);
            this.ui.showError('Recording stopped with errors');
        }
    }

    /**
     * Handle Mark Capture (screenshot placeholder)
     */
    async _handleMarkCapture() {
        try {
            const tab = await getActiveTab();
            if (!tab) return;

            await sendTabMessage(tab.id, { action: MESSAGE_ACTIONS.MARK_CAPTURE });
            this.ui.showSuccess('📸 Capture marked! (Ctrl+Shift+C)');
        } catch (error) {
            console.error('Mark capture failed:', error);
            this.ui.showError('Failed to mark capture');
        }
    }

    /**
     * Handle Download (both formats)
     * @param {string} format - 'intent' or 'workflow'
     */
    async _handleDownload(format) {
        try {
            const tab = await getActiveTab();
            if (!tab) return;

            const response = await sendTabMessage(tab.id, { action: MESSAGE_ACTIONS.GET_INTENT });

            if (!response?.intent) {
                this.ui.showError('No data found. Page may have been reloaded.');
                return;
            }

            const intent = response.intent;
            await StorageManager.saveIntentData(intent);

            let data, filename, successMsg;

            if (format === 'workflow') {
                // Compile to workflow IR
                const url = intent.url;
                const capturedSteps = intent.intent_analysis?.steps || [];

                data = DownloadManager.createWorkflow(url, capturedSteps, {
                    screenshotMode: this._settings.screenshotMode
                });
                filename = 'workflow_ir.json';
                successMsg = `Downloaded ${data.length} workflow nodes! (IR format)`;
            } else {
                // Legacy intent format
                data = intent;
                filename = 'flow_capture_intent.json';
                successMsg = 'Downloaded successfully! (Intent format)';
            }

            // Download file
            DownloadManager.downloadJSON(data, filename);
            this.ui.showSuccess(successMsg);

        } catch (error) {
            console.error('Download failed:', error);
            this.ui.showError('Failed to download: ' + error.message);
        }
    }

    // ─── Settings Handlers ───────────────────────────────

    /**
     * Open settings view
     */
    async _handleOpenSettings() {
        this._settings = await StorageManager.getSettings();
        this.ui.populateSettings(this._settings);
        this.ui.showSettings();
    }

    /**
     * Close settings and return to main view
     */
    async _handleCloseSettings() {
        // Cancel shortcut recording if active
        if (this._isRecordingShortcut) {
            this._isRecordingShortcut = false;
            this.ui.setShortcutRecording(false);
            this.ui.updateShortcutDisplay(this._settings.captureShortcut);
            if (this._shortcutListener) {
                document.removeEventListener('keydown', this._shortcutListener);
            }
        }

        const state = await StorageManager.getRecordingState();
        this.ui.hideSettings(state.isRecording, state.eventCount || 0);

        if (state.isRecording && state.startTime && !this.timer._interval) {
            this.timer.start(state.startTime);
        }
        if (!state.isRecording && state.eventCount > 0) {
            this.ui.enableDownload(state.eventCount);
        }
    }

    /**
     * Handle individual setting change - save immediately
     * @param {string} key
     * @param {*} value
     */
    async _handleSettingChange(key, value) {
        this._settings[key] = value;
        await StorageManager.saveSettings({ [key]: value });

        // Update shortcut badge if shortcut changed
        if (key === 'captureShortcut') {
            const shortcutBadge = document.querySelector('.shortcut-badge');
            if (shortcutBadge) {
                shortcutBadge.textContent = this.ui._formatShortcut(value);
            }
        }
    }

    /**
     * Handle shortcut recorder button click
     */
    _handleShortcutRecord() {
        if (this._isRecordingShortcut) {
            // Cancel recording
            this._isRecordingShortcut = false;
            this.ui.setShortcutRecording(false);
            this.ui.updateShortcutDisplay(this._settings.captureShortcut);
            if (this._shortcutListener) {
                document.removeEventListener('keydown', this._shortcutListener);
            }
            return;
        }

        this._isRecordingShortcut = true;
        this.ui.setShortcutRecording(true);

        this._shortcutListener = (e) => {
            e.preventDefault();
            e.stopPropagation();

            // Ignore standalone modifier keys
            if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

            // Require at least one modifier
            if (!e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
                this.ui.showError('Use at least one modifier (Ctrl, Shift, Alt)');
                return;
            }

            const shortcut = {
                ctrl: e.ctrlKey,
                shift: e.shiftKey,
                alt: e.altKey,
                meta: e.metaKey,
                key: e.key.length === 1 ? e.key.toUpperCase() : e.key
            };

            this._isRecordingShortcut = false;
            this.ui.setShortcutRecording(false);
            this.ui.updateShortcutDisplay(shortcut);
            document.removeEventListener('keydown', this._shortcutListener);

            this._handleSettingChange('captureShortcut', shortcut);
        };

        document.addEventListener('keydown', this._shortcutListener);
    }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    new PopupController();
});
