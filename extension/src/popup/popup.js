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
        this._isRecordingExpandShortcut = false;
        this._expandShortcutListener = null;
        this._messageListener = null;

        // Store current workflow for conversion
        this._currentWorkflow = null;
        this._currentWorkflowUrl = null;
        this._currentWorkflowSteps = null;
        this._resultsPrimaryAction = 'download'; // 'download' | 'copy'

        // Cleanup all resources when popup window closes
        window.addEventListener('unload', () => this._cleanup());

        this._init();
    }

    /**
     * Cleanup all resources (timer, listeners) on window unload
     * Prevents memory leaks from lingering intervals and event listeners
     * @private
     */
    _cleanup() {
        // Stop timer interval
        if (this.timer) {
            this.timer.stop();
        }

        // Remove message listener
        if (this._messageListener) {
            chrome.runtime.onMessage.removeListener(this._messageListener);
            this._messageListener = null;
        }

        // Remove shortcut recording listeners if active
        if (this._shortcutListener) {
            document.removeEventListener('keydown', this._shortcutListener);
            this._shortcutListener = null;
        }

        if (this._expandShortcutListener) {
            document.removeEventListener('keydown', this._expandShortcutListener);
            this._expandShortcutListener = null;
        }

        // Reset recording states
        this._isRecordingShortcut = false;
        this._isRecordingExpandShortcut = false;
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

            // Populate UI with saved settings (ensures radio buttons reflect stored state)
            this.ui.populateSettings(this._settings);

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
        console.log('🔧 Setting up popup handlers...');
        this.ui.onStartClick(() => this._handleStart());
        this.ui.onStopClick(() => this._handleStop());
        this.ui.onMarkCaptureClick(() => this._handleMarkCapture());
        this.ui.onDownloadFormatClick((format) => this._handleDownload(format));
        this.ui.onCopyClick(() => this._handleCopy());
        this.ui.onCopySettingClick(() => this._handleCopy());

        // Results view handlers
        this.ui.onConvertViewport((targetPreset) => this._handleConvertViewport(targetPreset));
        this.ui.onDownloadCurrentResult(() => this._handleCopyCurrentResult());
        this.ui.onDownloadWorkflow(() => this._handleDownloadWorkflow());
        this.ui.onDownloadIntent(() => this._handleDownloadIntent());
        this.ui.onBackToRecording(() => this._handleBackToRecording());

        console.log('✅ All handlers registered');

        // Settings handlers
        this.ui.onSettingsClick(() => this._handleOpenSettings());
        this.ui.onSettingsBackClick(() => this._handleCloseSettings());
        this.ui.onShortcutRecordClick(() => this._handleShortcutRecord());
        this.ui.onExpandShortcutRecordClick(() => this._handleExpandShortcutRecord());
        this.ui.onExportFormatChange((format) => this._handleSettingChange('defaultExportFormat', format));
        this.ui.onAutoMinimizeChange((val) => this._handleSettingChange('autoMinimizeOverlay', val));
        this.ui.onRecordingIndicatorChange((val) => this._handleSettingChange('showRecordingIndicator', val));
        this.ui.onManualExpandStepChange((val) => this._handleSettingChange('manualExpandStep', val));
        this.ui.onScreenshotModeChange((mode) => this._handleSettingChange('screenshotMode', mode));
        this.ui.onViewportPresetChange((preset) => this._handleSettingChange('viewportPreset', preset));
    }

    /**
     * Listen for messages from content script
     */
    _setupMessageListener() {
        // Store listener reference for cleanup
        this._messageListener = (msg) => {
            if (msg.action === MESSAGE_ACTIONS.INTENT_UPDATED) {
                this.ui.updateEventCount(msg.count);
                StorageManager.updateEventCount(msg.count).catch(console.error);
            }
        };

        chrome.runtime.onMessage.addListener(this._messageListener);
    }

    /**
     * Auto-inject content script and retry a message
     * Used when the content script is not yet loaded on the tab
     * @param {number} tabId
     * @param {Object} message
     * @returns {Promise<Object>}
     */
    async _injectAndRetry(tabId, message) {
        this.ui.showToast('Injecting recorder...', 'info', 2000);
        await chrome.scripting.executeScript({
            target: { tabId },
            files: ['src/content/content.js']
        });
        // Wait for script to initialize before retrying
        await new Promise(r => setTimeout(r, 800));
        return sendTabMessage(tabId, message);
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

            let response;
            try {
                response = await sendTabMessage(tab.id, { action: MESSAGE_ACTIONS.START_RECORDING });
            } catch (err) {
                // Content script not loaded — try auto-injection then retry
                if (err.message?.includes('Could not establish connection') ||
                    err.message?.includes('Receiving end does not exist')) {
                    response = await this._injectAndRetry(tab.id, { action: MESSAGE_ACTIONS.START_RECORDING });
                } else {
                    throw err;
                }
            }

            if (response?.status === 'started') {
                this.ui.updateState(true, 0);
                this.timer.start(now);
            }
        } catch (error) {
            console.error('Start recording failed:', error);
            this.ui.showError('Failed to start: ' + error.message);
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
            console.log('%c📥 Download requested (HANDLER CALLED)', 'color: blue; font-weight: bold', format);
            const tab = await getActiveTab();
            if (!tab) {
                console.warn('❌ No active tab found');
                return;
            }

            console.log('📍 Active tab found:', tab.url);

            const response = await sendTabMessage(tab.id, { action: MESSAGE_ACTIONS.GET_INTENT });

            if (!response?.intent) {
                this.ui.showError('No data found. Page may have been reloaded.');
                console.warn('❌ No intent data in response');
                return;
            }

            const intent = response.intent;
            console.log('✓ Intent received');

            // Validate intent structure before proceeding
            const steps = intent.intent_analysis?.steps;
            if (!Array.isArray(steps) || steps.length === 0) {
                this.ui.showError('No steps recorded. Start a recording session first.');
                console.warn('❌ No steps in intent');
                return;
            }

            console.log(`✓ Found ${steps.length} steps`);

            await StorageManager.saveIntentData(intent);

            let data, filename, successMsg;

            if (format === 'workflow') {
                console.log('%c📊 WORKFLOW FORMAT SELECTED', 'color: green; font-weight: bold');
                // Compile to workflow IR
                const url = intent.url;
                const capturedSteps = steps;

                const compilerOptions = {
                    screenshotMode: this._settings.screenshotMode,
                    viewportPreset: this._settings.viewportPreset
                };
                console.log('📱 Creating workflow with options:', compilerOptions);
                data = DownloadManager.createWorkflow(url, capturedSteps, compilerOptions);
                filename = 'workflow_ir.json';
                successMsg = `✓ Generated workflow with ${data.length} nodes!`;

                console.log(`✓ Workflow compiled: ${data.length} nodes`);

                // Store for conversion
                this._currentWorkflow = data;
                this._currentWorkflowUrl = url;
                this._currentWorkflowSteps = capturedSteps;
                this._resultsPrimaryAction = 'download';

                console.log('💾 Workflow stored in controller');

                // Show results view instead of immediate download
                console.log('%c🎯 SHOWING RESULTS VIEW NOW', 'color: red; font-weight: bold', {
                    stepsLength: steps.length,
                    preset: this._settings.viewportPreset
                });

                this.ui.closeDropdown();
                this.ui.showResults(steps.length, this._settings.viewportPreset);
                
                this.ui.showSuccess(successMsg);
                return;
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
            console.error('%c❌ Download failed with error:', 'color: red; font-weight: bold', error);
            this.ui.showError('Failed to download: ' + error.message);
        }
    }

    /**
     * Handle Copy to Clipboard
     * Specifically copies the Workflow (IR) format as requested
     */
    async _handleCopy() {
        try {
            const tab = await getActiveTab();
            if (!tab) return;

            const response = await sendTabMessage(tab.id, { action: MESSAGE_ACTIONS.GET_INTENT });

            if (!response?.intent) {
                this.ui.showError('No data found to copy.');
                return;
            }

            const intent = response.intent;
            const capturedSteps = intent.intent_analysis?.steps;

            if (!Array.isArray(capturedSteps) || capturedSteps.length === 0) {
                this.ui.showError('No steps recorded. Start a recording session first.');
                return;
            }

            // Specifically copy as workflow as requested
            const url = intent.url;

            const compilerOptions = {
                screenshotMode: this._settings.screenshotMode,
                viewportPreset: this._settings.viewportPreset
            };
            console.log('📱 Creating workflow (copy) with options:', compilerOptions);
            const data = DownloadManager.createWorkflow(url, capturedSteps, compilerOptions);

            // Store for conversion + results view
            this._currentWorkflow = data;
            this._currentWorkflowUrl = url;
            this._currentWorkflowSteps = capturedSteps;

            // Show results view so user can convert viewport then copy
            this.ui.closeDropdown();
            this.ui.showResults(capturedSteps.length, this._settings.viewportPreset);
            this.ui.showToast('Converta (opcional) e clique em "Copy Workflow".', 'info', 3200);

        } catch (error) {
            console.error('Copy failed:', error);
            this.ui.showError('Copy failed: ' + error.message);
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

        // Cancel expand shortcut recording if active
        if (this._isRecordingExpandShortcut) {
            this._isRecordingExpandShortcut = false;
            this.ui.setExpandShortcutRecording(false);
            this.ui.updateExpandShortcutDisplay(this._settings.expandShortcut);
            if (this._expandShortcutListener) {
                document.removeEventListener('keydown', this._expandShortcutListener);
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

    /**
     * Handle expand shortcut recorder button click
     */
    _handleExpandShortcutRecord() {
        if (this._isRecordingExpandShortcut) {
            this._isRecordingExpandShortcut = false;
            this.ui.setExpandShortcutRecording(false);
            this.ui.updateExpandShortcutDisplay(this._settings.expandShortcut);
            if (this._expandShortcutListener) {
                document.removeEventListener('keydown', this._expandShortcutListener);
            }
            return;
        }

        this._isRecordingExpandShortcut = true;
        this.ui.setExpandShortcutRecording(true);

        this._expandShortcutListener = (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

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

            this._isRecordingExpandShortcut = false;
            this.ui.setExpandShortcutRecording(false);
            this.ui.updateExpandShortcutDisplay(shortcut);
            document.removeEventListener('keydown', this._expandShortcutListener);

            this._handleSettingChange('expandShortcut', shortcut);
        };

        document.addEventListener('keydown', this._expandShortcutListener);
    }

    /**
     * Handle viewport conversion request
     * @param {string} targetPreset - 'desktop' | 'mobile'
     */
    async _handleConvertViewport(targetPreset) {
        try {
            console.log('🔄 Convert viewport requested:', targetPreset);
            if (!this._currentWorkflow) {
                this.ui.showError('No workflow data to convert');
                console.warn('⚠️ No current workflow stored');
                return;
            }

            const currentPreset = DownloadManager.detectWorkflowViewport(this._currentWorkflow);
            console.log(`🔄 Converting workflow from ${currentPreset} to ${targetPreset}`);

            // Convert the workflow
            this._currentWorkflow = DownloadManager.convertWorkflowViewport(
                this._currentWorkflow,
                targetPreset
            );

            // Update UI to reflect new preset
            this.ui.updateConversionComplete(targetPreset);
            console.log('✅ Conversion complete');

        } catch (error) {
            console.error('❌ Conversion failed:', error);
            this.ui.showError('Failed to convert: ' + error.message);
        }
    }

    /**
     * Handle copy current result (primary action — always copies to clipboard)
     */
    async _handleCopyCurrentResult() {
        try {
            if (!this._currentWorkflow) {
                this.ui.showError('No workflow data to copy');
                return;
            }

            const currentPreset = DownloadManager.detectWorkflowViewport(this._currentWorkflow);
            const success = await DownloadManager.copyToClipboard(this._currentWorkflow);
            
            if (success) {
                this.ui.showSuccess(`✓ Copied workflow (${currentPreset})`);
            } else {
                this.ui.showError('Failed to copy to clipboard');
            }
        } catch (error) {
            console.error('❌ Copy failed:', error);
            this.ui.showError('Failed to copy: ' + error.message);
        }
    }

    /**
     * Handle download workflow (IR format) from More Options
     */
    _handleDownloadWorkflow() {
        try {
            if (!this._currentWorkflow) {
                this.ui.showError('No workflow data to download');
                return;
            }

            const currentPreset = DownloadManager.detectWorkflowViewport(this._currentWorkflow);
            const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
            const filename = `workflow_${currentPreset}_${timestamp}.json`;

            DownloadManager.downloadJSON(this._currentWorkflow, filename);
            this.ui.showSuccess(`✓ Downloaded workflow (${currentPreset})`);
        } catch (error) {
            console.error('❌ Download workflow failed:', error);
            this.ui.showError('Failed to download: ' + error.message);
        }
    }

    /**
     * Handle download intent (legacy format) from More Options
     */
    async _handleDownloadIntent() {
        try {
            const tab = await getActiveTab();
            if (!tab) return;

            const response = await sendTabMessage(tab.id, { action: MESSAGE_ACTIONS.GET_INTENT });
            if (!response?.intent) {
                this.ui.showError('No intent data available');
                return;
            }

            const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
            DownloadManager.downloadJSON(response.intent, `intent_${timestamp}.json`);
            this.ui.showSuccess('✓ Downloaded intent (legacy)');
        } catch (error) {
            console.error('❌ Download intent failed:', error);
            this.ui.showError('Failed to download: ' + error.message);
        }
    }

    /**
     * Handle back to recording button - reset to idle state
     */
    async _handleBackToRecording() {
        try {
            console.log('↩️ Back to recording requested');
            // Clear stored workflow
            this._currentWorkflow = null;
            this._currentWorkflowUrl = null;
            this._currentWorkflowSteps = null;

            // Reset to idle state
            this.ui.hideResults();
            this.ui.updateState(false, 0);

            // Clear recording state storage
            await StorageManager.setRecordingState(false);

            this.ui.showSuccess('Ready for new recording');
            console.log('✅ Reset to recording state');
        } catch (error) {
            console.error('❌ Back to recording failed:', error);
            this.ui.showError('Failed to reset: ' + error.message);
        }
    }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    new PopupController();
});
