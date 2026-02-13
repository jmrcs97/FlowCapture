/**
 * FlowCapture - Unified Timer Utility
 * Eliminates duplication between content.js:826-839 and popup.js:16-33
 */

import { CONFIG } from './constants.js';

/**
 * Timer class for managing recording duration display
 * Provides consistent timing across popup and overlay UI
 */
export class Timer {
    /**
     * @param {Function} updateCallback - Called every second with formatted time and elapsed ms
     */
    constructor(updateCallback) {
        this.updateCallback = updateCallback;
        this.intervalId = null;
        this.startTimestamp = null;
        this.isPaused = false;
        this.pausedElapsed = 0;
    }

    /**
     * Start or resume the timer
     * @param {number} timestamp - Start timestamp (Date.now()). If not provided, uses current time.
     */
    start(timestamp = null) {
        // Stop any existing timer first
        this.stop();

        this.startTimestamp = timestamp || Date.now();
        this.isPaused = false;

        // Immediately update UI with initial value
        this._update();

        // Set interval for periodic updates
        this.intervalId = setInterval(() => {
            this._update();
        }, CONFIG.UI.TIMER_UPDATE_INTERVAL);
    }

    /**
     * Stop the timer and clear interval
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.isPaused = false;
        this.pausedElapsed = 0;
    }

    /**
     * Pause the timer (keeps elapsed time)
     */
    pause() {
        if (!this.isPaused && this.intervalId) {
            this.isPaused = true;
            this.pausedElapsed = this.getElapsed();
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    /**
     * Resume a paused timer
     */
    resume() {
        if (this.isPaused) {
            this.startTimestamp = Date.now() - this.pausedElapsed;
            this.isPaused = false;

            this._update();

            this.intervalId = setInterval(() => {
                this._update();
            }, CONFIG.UI.TIMER_UPDATE_INTERVAL);
        }
    }

    /**
     * Internal update method - calls callback with formatted time
     * @private
     */
    _update() {
        const elapsed = this.getElapsed();
        const formatted = this.formatTime(elapsed);

        if (this.updateCallback) {
            this.updateCallback(formatted, elapsed);
        }
    }

    /**
     * Format milliseconds to MM:SS string
     * @param {number} ms - Milliseconds to format
     * @returns {string} Formatted time string (e.g., "02:35")
     */
    formatTime(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
        const seconds = (totalSeconds % 60).toString().padStart(2, '0');
        return `${minutes}:${seconds}`;
    }

    /**
     * Format milliseconds to HH:MM:SS string (for long recordings)
     * @param {number} ms - Milliseconds to format
     * @returns {string} Formatted time string (e.g., "01:02:35")
     */
    formatTimeLong(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
        const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
        const seconds = (totalSeconds % 60).toString().padStart(2, '0');

        // Only show hours if recording is longer than 1 hour
        if (hours === '00') {
            return `${minutes}:${seconds}`;
        }
        return `${hours}:${minutes}:${seconds}`;
    }

    /**
     * Get elapsed time in milliseconds
     * @returns {number} Elapsed milliseconds since start
     */
    getElapsed() {
        if (this.isPaused) {
            return this.pausedElapsed;
        }

        if (!this.startTimestamp) {
            return 0;
        }

        return Date.now() - this.startTimestamp;
    }

    /**
     * Get start timestamp
     * @returns {number|null} Start timestamp or null if not started
     */
    getStartTime() {
        return this.startTimestamp;
    }

    /**
     * Check if timer is currently running
     * @returns {boolean} True if timer is active (not stopped or paused)
     */
    isRunning() {
        return this.intervalId !== null && !this.isPaused;
    }

    /**
     * Check if timer is paused
     * @returns {boolean} True if timer is paused
     */
    isPausedState() {
        return this.isPaused;
    }

    /**
     * Reset timer to initial state
     */
    reset() {
        this.stop();
        this.startTimestamp = null;
        this.pausedElapsed = 0;
    }

    /**
     * Get formatted current time
     * @returns {string} Formatted time string
     */
    getCurrentFormatted() {
        return this.formatTime(this.getElapsed());
    }
}

/**
 * Static utility functions for one-off time formatting
 */
export class TimeUtils {
    /**
     * Format duration in milliseconds to readable string
     * @param {number} ms - Duration in milliseconds
     * @returns {string} Formatted duration (e.g., "2.5s", "1m 30s")
     */
    static formatDuration(ms) {
        if (ms < 1000) {
            return `${ms}ms`;
        }

        const seconds = Math.floor(ms / 1000);

        if (seconds < 60) {
            const decimal = ((ms % 1000) / 1000).toFixed(1);
            return `${seconds}${decimal > 0 ? decimal.substring(1) : ''}s`;
        }

        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;

        if (minutes < 60) {
            return remainingSeconds > 0
                ? `${minutes}m ${remainingSeconds}s`
                : `${minutes}m`;
        }

        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        return `${hours}h ${remainingMinutes}m`;
    }

    /**
     * Parse MM:SS string to milliseconds
     * @param {string} timeString - Time string in MM:SS format
     * @returns {number} Milliseconds
     */
    static parseTimeString(timeString) {
        const parts = timeString.split(':');
        if (parts.length !== 2) return 0;

        const minutes = parseInt(parts[0], 10) || 0;
        const seconds = parseInt(parts[1], 10) || 0;

        return (minutes * 60 + seconds) * 1000;
    }

    /**
     * Get human-readable "ago" time (e.g., "2 minutes ago")
     * @param {number} timestamp - Past timestamp
     * @returns {string} Human-readable time difference
     */
    static getTimeAgo(timestamp) {
        const elapsed = Date.now() - timestamp;
        const seconds = Math.floor(elapsed / 1000);

        if (seconds < 60) return 'just now';

        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;

        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;

        const days = Math.floor(hours / 24);
        return `${days} day${days > 1 ? 's' : ''} ago`;
    }
}
