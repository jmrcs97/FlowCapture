/**
 * FlowCapture - State Manager
 * NEW MODULE: Centralizes recording state management
 * Eliminates 25+ scattered state locations across content.js and popup.js
 * Single source of truth for isRecording, recordedSteps, startTime
 */

import { StorageManager } from '../../shared/storage.js';
import { MESSAGE_ACTIONS } from '../../shared/constants.js';

/**
 * Centralized State Manager for recording lifecycle
 */
export class StateManager {
    constructor() {
        // Core state
        this.isRecording = false;
        this.recordedSteps = [];
        this.startTime = null;

        // Change listeners
        this._listeners = new Map();
        this._listenerIdCounter = 0;
    }

    /**
     * Initialize state from storage (for page reload recovery)
     * @returns {Promise<Object>} Current state
     */
    async initialize() {
        try {
            const stored = await StorageManager.getRecordingState();

            this.isRecording = stored.isRecording;
            this.startTime = stored.startTime;

            // Note: steps are not stored in storage (too large)
            // They are lost on page reload - this is by design
            this.recordedSteps = [];

            this._notifyListeners('initialized', this.getState());

            return this.getState();
        } catch (error) {
            console.error('StateManager: Failed to initialize:', error);
            return this.getState();
        }
    }

    /**
     * Start recording
     * @returns {Promise<void>}
     */
    async startRecording() {
        this.isRecording = true;
        this.recordedSteps = [];
        this.startTime = Date.now();

        await StorageManager.setRecordingState(true, this.startTime, 0);

        this._notifyListeners('recordingStarted', this.getState());
    }

    /**
     * Stop recording
     * @returns {Promise<number>} Number of steps recorded
     */
    async stopRecording() {
        this.isRecording = false;
        const count = this.recordedSteps.length;

        await StorageManager.setRecordingState(false, null, count);

        this._notifyListeners('recordingStopped', this.getState());

        return count;
    }

    /**
     * Add a recorded step
     * @param {Object} step - Step data from InteractionSession
     * @returns {number} Total step count
     */
    addStep(step) {
        this.recordedSteps.push(step);
        const count = this.recordedSteps.length;

        // Non-blocking storage update (debounced)
        StorageManager.updateEventCount(count).catch(err => {
            console.warn('StateManager: Failed to update count in storage:', err);
        });

        this._notifyListeners('stepAdded', { step, count });

        return count;
    }

    /**
     * Get all recorded steps
     * @returns {Array} Recorded steps
     */
    getSteps() {
        return this.recordedSteps;
    }

    /**
     * Get step count
     * @returns {number}
     */
    getStepCount() {
        return this.recordedSteps.length;
    }

    /**
     * Get current state snapshot
     * @returns {Object} State snapshot
     */
    getState() {
        return {
            isRecording: this.isRecording,
            stepCount: this.recordedSteps.length,
            startTime: this.startTime,
            hasSteps: this.recordedSteps.length > 0
        };
    }

    /**
     * Get last recorded step
     * @returns {Object|null} Last step or null
     */
    getLastStep() {
        if (this.recordedSteps.length === 0) return null;
        return this.recordedSteps[this.recordedSteps.length - 1];
    }

    /**
     * Clear all recorded steps
     */
    clearSteps() {
        this.recordedSteps = [];
        this._notifyListeners('stepsCleared', this.getState());
    }

    /**
     * Subscribe to state changes
     * @param {Function} callback - Called with (eventName, state)
     * @returns {Function} Unsubscribe function
     */
    onChange(callback) {
        const id = ++this._listenerIdCounter;
        this._listeners.set(id, callback);

        // Return unsubscribe function
        return () => {
            this._listeners.delete(id);
        };
    }

    /**
     * Notify all listeners of a state change
     * @param {string} eventName - Name of the event
     * @param {Object} data - Event data
     * @private
     */
    _notifyListeners(eventName, data) {
        this._listeners.forEach(callback => {
            try {
                callback(eventName, data);
            } catch (error) {
                console.error('StateManager: Listener error:', error);
            }
        });
    }

    /**
     * Notify popup of state change via Chrome messaging
     * @param {number} count - Current step count
     */
    notifyPopup(count) {
        chrome.runtime.sendMessage({
            action: MESSAGE_ACTIONS.INTENT_UPDATED,
            count
        }).catch(() => {
            // Popup might not be open - ignore silently
        });
    }

    /**
     * Reset state to initial values
     * @returns {Promise<void>}
     */
    async reset() {
        this.isRecording = false;
        this.recordedSteps = [];
        this.startTime = null;

        await StorageManager.clearRecordingData();

        this._notifyListeners('reset', this.getState());
    }
}
