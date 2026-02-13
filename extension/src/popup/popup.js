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
 * Send message to tab
 * @param {number} tabId
 * @param {Object} message
 * @returns {Promise<Object>}
 */
async function sendTabMessage(tabId, message) {
    return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, message, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve(response);
            }
        });
    });
}

/**
 * Get from storage
 * @param {string[]} keys
 * @returns {Promise<Object>}
 */
async function storageGet(keys) {
    return new Promise((resolve) => {
        chrome.storage.local.get(keys, resolve);
    });
}

/**
 * Set in storage
 * @param {Object} data
 * @returns {Promise<void>}
 */
async function storageSet(data) {
    return new Promise((resolve) => {
        chrome.storage.local.set(data, resolve);
    });
}

// ─── Timer (inline, no dynamic import needed) ─────────────

class SimpleTimer {
    constructor(callback) {
        this.callback = callback;
        this.intervalId = null;
        this.startTimestamp = null;
    }

    start(timestamp = null) {
        this.stop();
        this.startTimestamp = timestamp || Date.now();
        this._tick();
        this.intervalId = setInterval(() => this._tick(), 1000);
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    _tick() {
        const elapsed = Date.now() - this.startTimestamp;
        const totalSeconds = Math.floor(elapsed / 1000);
        const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
        const s = (totalSeconds % 60).toString().padStart(2, '0');
        this.callback(`${m}:${s}`);
    }
}

// ─── Popup Controller ─────────────────────────────────

class PopupController {
    constructor() {
        this.ui = new PopupUI();
        this.timer = new SimpleTimer((formatted) => this.ui.updateTimer(formatted));

        this._init();
    }

    /**
     * Initialize popup state and event handlers
     */
    async _init() {
        try {
            // Restore state from storage
            const state = await storageGet(['isRecording', 'startTime', 'eventCount', 'intentData']);

            if (state.isRecording) {
                this.ui.updateState(true, state.eventCount || 0);
                if (state.startTime) {
                    this.timer.start(state.startTime);
                }
            } else if (state.intentData?.intent_analysis?.steps?.length) {
                this.ui.updateState(false, state.intentData.intent_analysis.steps.length);
                this.ui.enableDownload(state.intentData.intent_analysis.steps.length);
            }

            // Register event handlers
            this._setupHandlers();

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
        this.ui.onCheckpointClick(() => this._handleCheckpoint());
        this.ui.onDownloadClick(() => this._handleDownload());
    }

    /**
     * Listen for messages from content script
     */
    _setupMessageListener() {
        chrome.runtime.onMessage.addListener((msg) => {
            if (msg.action === 'intentUpdated') {
                this.ui.updateEventCount(msg.count);
                storageSet({ eventCount: msg.count }).catch(console.error);
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

            const now = Date.now();
            await storageSet({ isRecording: true, startTime: now, eventCount: 0 });

            const response = await sendTabMessage(tab.id, { action: 'startRecording' });

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
                this.ui.showError('Failed to start recording');
            }

            await storageSet({ isRecording: false });
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

            const response = await sendTabMessage(tab.id, { action: 'stopRecording' });
            const count = response?.count || 0;

            await storageSet({ isRecording: false, eventCount: count });

            this.timer.stop();
            this.ui.updateState(false, count);

            if (count > 0) {
                this.ui.enableDownload(count);
                this.ui.showSuccess(`Recorded ${count} steps`);
            }
        } catch (error) {
            console.error('Stop recording failed:', error);

            // Force UI reset
            await storageSet({ isRecording: false });
            this.timer.stop();
            this.ui.updateState(false, 0);
            this.ui.showError('Recording stopped with errors');
        }
    }

    /**
     * Handle Checkpoint Capture
     */
    async _handleCheckpoint() {
        try {
            const tab = await getActiveTab();
            if (!tab) return;

            await sendTabMessage(tab.id, { action: 'captureState' });
            this.ui.showSuccess('Checkpoint captured!');
        } catch (error) {
            console.error('Checkpoint failed:', error);
            this.ui.showError('Failed to capture checkpoint');
        }
    }

    /**
     * Handle Download Intent
     */
    async _handleDownload() {
        try {
            const tab = await getActiveTab();
            if (!tab) return;

            const response = await sendTabMessage(tab.id, { action: 'getIntent' });

            if (!response?.intent) {
                this.ui.showError('No data found. Page may have been reloaded.');
                return;
            }

            const intent = response.intent;

            // Cache in storage
            await storageSet({ intentData: intent });

            // Download file
            const blob = new Blob([JSON.stringify(intent, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'flow_capture.json';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();

            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);

            this.ui.showSuccess('Downloaded successfully!');
        } catch (error) {
            console.error('Download failed:', error);
            this.ui.showError('Could not retrieve data. Page might have been reloaded.');
        }
    }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    new PopupController();
});
