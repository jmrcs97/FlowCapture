/**
 * FlowCapture - Chrome Storage Wrapper
 * Provides async/await interface for chrome.storage.local
 * Eliminates callback hell and provides type safety
 */

import { STORAGE_KEYS, ERROR_MESSAGES } from './constants.js';

/**
 * Storage Manager - Async wrapper for chrome.storage.local
 * Converts callback-based Chrome API to Promise-based async/await
 */
export class StorageManager {
    /**
     * Get value(s) from chrome.storage.local
     * @param {string|string[]|Object} keys - Key(s) to retrieve
     * @returns {Promise<Object>} Retrieved values
     */
    static async get(keys) {
        return new Promise((resolve, reject) => {
            try {
                chrome.storage.local.get(keys, (result) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message || ERROR_MESSAGES.STORAGE_ERROR));
                    } else {
                        resolve(result);
                    }
                });
            } catch (error) {
                reject(new Error(ERROR_MESSAGES.STORAGE_ERROR + ': ' + error.message));
            }
        });
    }

    /**
     * Set value(s) in chrome.storage.local
     * @param {Object} data - Key-value pairs to store
     * @returns {Promise<void>}
     */
    static async set(data) {
        return new Promise((resolve, reject) => {
            try {
                chrome.storage.local.set(data, () => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message || ERROR_MESSAGES.STORAGE_ERROR));
                    } else {
                        resolve();
                    }
                });
            } catch (error) {
                reject(new Error(ERROR_MESSAGES.STORAGE_ERROR + ': ' + error.message));
            }
        });
    }

    /**
     * Remove key(s) from chrome.storage.local
     * @param {string|string[]} keys - Key(s) to remove
     * @returns {Promise<void>}
     */
    static async remove(keys) {
        return new Promise((resolve, reject) => {
            try {
                chrome.storage.local.remove(keys, () => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message || ERROR_MESSAGES.STORAGE_ERROR));
                    } else {
                        resolve();
                    }
                });
            } catch (error) {
                reject(new Error(ERROR_MESSAGES.STORAGE_ERROR + ': ' + error.message));
            }
        });
    }

    /**
     * Clear all data from chrome.storage.local
     * @returns {Promise<void>}
     */
    static async clear() {
        return new Promise((resolve, reject) => {
            try {
                chrome.storage.local.clear(() => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message || ERROR_MESSAGES.STORAGE_ERROR));
                    } else {
                        resolve();
                    }
                });
            } catch (error) {
                reject(new Error(ERROR_MESSAGES.STORAGE_ERROR + ': ' + error.message));
            }
        });
    }

    /**
     * Get current recording state with type safety
     * @returns {Promise<Object>} Recording state
     */
    static async getRecordingState() {
        try {
            const result = await this.get([
                STORAGE_KEYS.IS_RECORDING,
                STORAGE_KEYS.START_TIME,
                STORAGE_KEYS.EVENT_COUNT,
                STORAGE_KEYS.INTENT_DATA,
                STORAGE_KEYS.RECORDED_STEPS
            ]);

            return {
                isRecording: result[STORAGE_KEYS.IS_RECORDING] || false,
                startTime: result[STORAGE_KEYS.START_TIME] || null,
                eventCount: result[STORAGE_KEYS.EVENT_COUNT] || 0,
                intentData: result[STORAGE_KEYS.INTENT_DATA] || null,
                recordedSteps: result[STORAGE_KEYS.RECORDED_STEPS] || []
            };
        } catch (error) {
            console.error('Failed to get recording state:', error);
            // Return safe defaults
            return {
                isRecording: false,
                startTime: null,
                eventCount: 0,
                intentData: null,
                recordedSteps: []
            };
        }
    }

    /**
     * Set recording state
     * @param {boolean} isRecording - Whether recording is active
     * @param {number|null} startTime - Recording start timestamp
     * @param {number} eventCount - Number of events recorded
     * @returns {Promise<void>}
     */
    static async setRecordingState(isRecording, startTime = null, eventCount = 0) {
        const data = {
            [STORAGE_KEYS.IS_RECORDING]: isRecording,
            [STORAGE_KEYS.START_TIME]: startTime,
            [STORAGE_KEYS.EVENT_COUNT]: eventCount
        };

        return this.set(data);
    }

    /**
     * Update event count
     * @param {number} count - New event count
     * @returns {Promise<void>}
     */
    static async updateEventCount(count) {
        return this.set({ [STORAGE_KEYS.EVENT_COUNT]: count });
    }

    /**
     * Save intent data (recorded steps)
     * @param {Object} intentData - Complete intent object with steps
     * @returns {Promise<void>}
     */
    static async saveIntentData(intentData) {
        return this.set({ [STORAGE_KEYS.INTENT_DATA]: intentData });
    }

    /**
     * Save recorded steps
     * @param {Array} steps - Array of recorded step objects
     * @returns {Promise<void>}
     */
    static async saveRecordedSteps(steps) {
        return this.set({ [STORAGE_KEYS.RECORDED_STEPS]: steps });
    }

    /**
     * Clear recording data (keeps other settings)
     * @returns {Promise<void>}
     */
    static async clearRecordingData() {
        return this.remove([
            STORAGE_KEYS.IS_RECORDING,
            STORAGE_KEYS.START_TIME,
            STORAGE_KEYS.EVENT_COUNT,
            STORAGE_KEYS.INTENT_DATA,
            STORAGE_KEYS.RECORDED_STEPS
        ]);
    }

    /**
     * Get storage usage information
     * @returns {Promise<Object>} Storage usage stats
     */
    static async getStorageInfo() {
        return new Promise((resolve, reject) => {
            try {
                chrome.storage.local.getBytesInUse(null, (bytesInUse) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        const quota = chrome.storage.local.QUOTA_BYTES || 5242880; // 5MB default
                        resolve({
                            bytesInUse,
                            quota,
                            percentUsed: ((bytesInUse / quota) * 100).toFixed(2),
                            available: quota - bytesInUse
                        });
                    }
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Check if storage is available
     * @returns {boolean} True if chrome.storage.local is available
     */
    static isAvailable() {
        return typeof chrome !== 'undefined' &&
            chrome.storage &&
            chrome.storage.local;
    }

    /**
     * Add change listener for storage updates
     * @param {Function} callback - Called when storage changes
     * @returns {Function} Cleanup function to remove listener
     */
    static addChangeListener(callback) {
        const listener = (changes, areaName) => {
            if (areaName === 'local') {
                callback(changes);
            }
        };

        if (this.isAvailable()) {
            chrome.storage.onChanged.addListener(listener);

            // Return cleanup function
            return () => {
                chrome.storage.onChanged.removeListener(listener);
            };
        }

        // No-op cleanup if storage not available
        return () => { };
    }

    /**
     * Debounced set - useful for frequent updates
     * @param {Object} data - Data to set
     * @param {number} delay - Debounce delay in ms (default: 100)
     * @returns {Promise<void>}
     */
    static debounce(data, delay = 100) {
        if (this._debounceTimer) {
            clearTimeout(this._debounceTimer);
        }

        return new Promise((resolve, reject) => {
            this._debounceTimer = setTimeout(async () => {
                try {
                    await this.set(data);
                    resolve();
                } catch (error) {
                    reject(error);
                } finally {
                    this._debounceTimer = null;
                }
            }, delay);
        });
    }
}

// Static property for debounce timer
StorageManager._debounceTimer = null;
