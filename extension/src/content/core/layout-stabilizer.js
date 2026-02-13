/**
 * FlowCapture - Layout Stabilizer
 * Extracted from content.js:57-203
 * IMPROVEMENTS:
 * - Memory leak fix: cleanup() method properly clears candidates and snapshots
 * - Config-driven thresholds (no magic numbers)
 * - Dependency injection (selectorEngine)
 * - Better error handling
 */

import { CONFIG } from '../../shared/constants.js';

/**
 * Visual Layout Change Detector with Stabilization
 * Monitors DOM elements for visual changes and waits for layout to stabilize
 */
export class LayoutStabilizer {
    /**
     * @param {SelectorEngine} selectorEngine - Selector generator instance
     */
    constructor(selectorEngine) {
        this.selectorEngine = selectorEngine;

        // Tracking sets
        this.candidates = new Set();      // Elements being monitored
        this.snapshots = new Map();       // Element -> measurement snapshot
        this.visualChanges = {};          // Selector -> {before, after, diffs}

        // State
        this.isStabilizing = false;
        this.stableFrames = 0;
        this.animationDetected = false;

        // Timestamps
        this.startTime = 0;
        this.lastChangeTime = 0;

        // RAF handle
        this.rafId = null;

        // Callback
        this.onStabilized = null;
    }

    /**
     * Add element to monitoring candidates
     * @param {Element} el - DOM element to monitor
     */
    addCandidate(el) {
        if (!el || el.nodeType !== 1) return;

        if (!this.candidates.has(el)) {
            this.candidates.add(el);
            // Capture initial state immediately
            this.snapshots.set(el, this._measure(el));
        }
    }

    /**
     * Add multiple candidates at once
     * @param {Array<Element>} elements - Array of elements to monitor
     */
    addCandidates(elements) {
        elements.forEach(el => this.addCandidate(el));
    }

    /**
     * Measure visual properties of an element
     * @param {Element} el - DOM element
     * @returns {Object} Measurement snapshot
     * @private
     */
    _measure(el) {
        try {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);

            return {
                rect: {
                    top: rect.top,
                    left: rect.left,
                    width: rect.width,
                    height: rect.height,
                    bottom: rect.bottom,
                    right: rect.right
                },
                scrollH: el.scrollHeight,
                scrollW: el.scrollWidth,
                transform: style.transform,
                opacity: parseFloat(style.opacity || 1),
                visibility: style.visibility,
                display: style.display
            };
        } catch (error) {
            console.warn('Failed to measure element:', error);
            return null;
        }
    }

    /**
     * Start stabilization monitoring
     * @param {Function} onStabilized - Callback when layout stabilizes
     */
    start(onStabilized) {
        if (this.isStabilizing) {
            console.warn('LayoutStabilizer already running');
            return;
        }

        this.isStabilizing = true;
        this.onStabilized = onStabilized;
        this.startTime = Date.now();
        this.lastChangeTime = Date.now();
        this.stableFrames = 0;
        this.animationDetected = false;
        this.visualChanges = {};

        this._loop();
    }

    /**
     * Stop stabilization monitoring
     */
    stop() {
        this.isStabilizing = false;

        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    /**
     * Clean up and release resources - MEMORY LEAK FIX
     * Call this when session is complete to prevent memory leaks
     */
    cleanup() {
        this.stop();

        // Clear all collections - CRITICAL for memory management
        this.candidates.clear();
        this.snapshots.clear();
        this.visualChanges = {};

        // Reset state
        this.stableFrames = 0;
        this.animationDetected = false;
        this.onStabilized = null;
    }

    /**
     * Main stabilization loop (RAF-based)
     * @private
     */
    _loop() {
        if (!this.isStabilizing) return;

        let hasChange = false;
        const now = Date.now();

        // Convert to array to avoid iterator issues when deleting
        const candidatesArray = Array.from(this.candidates);

        candidatesArray.forEach(el => {
            // If element is detached from DOM, stop tracking it
            if (!document.contains(el)) {
                this.candidates.delete(el);
                this.snapshots.delete(el); // MEMORY LEAK FIX: also remove snapshot
                return;
            }

            const current = this._measure(el);
            if (!current) return; // Skip if measurement failed

            const prev = this.snapshots.get(el);

            if (prev) {
                if (this._isDifferent(prev, current)) {
                    hasChange = true;
                    this.animationDetected = true;
                    this.lastChangeTime = now;

                    // Store the delta for the report
                    const selector = this.selectorEngine.getUniqueSelector(el);
                    if (selector) {
                        if (!this.visualChanges[selector]) {
                            this.visualChanges[selector] = {
                                before: prev,
                                after: current, // Will update continuously until stable
                                diffs: []
                            };
                        }
                        this.visualChanges[selector].after = current;
                    }

                    // Update snapshot for next frame diff
                    this.snapshots.set(el, current);
                }
            } else {
                // First time seeing this element in loop, take snapshot
                this.snapshots.set(el, current);
                hasChange = true;
            }
        });

        // Update stability counter
        if (hasChange) {
            this.stableFrames = 0;
        } else {
            this.stableFrames++;
        }

        // Check stability criteria (config-driven)
        const timeElapsed = now - this.startTime;
        const timeSinceLastChange = now - this.lastChangeTime;

        const { MIN_STABLE_FRAMES, MIN_WAIT_MS, MAX_TIMEOUT_MS } = CONFIG.STABILIZATION;

        const isStable = this.stableFrames > MIN_STABLE_FRAMES && timeElapsed > MIN_WAIT_MS;
        const isTimeout = timeElapsed > MAX_TIMEOUT_MS;

        if (isStable || isTimeout) {
            this.stop();

            // Call callback with report
            if (this.onStabilized) {
                this.onStabilized({
                    stabilized_after_ms: timeSinceLastChange,
                    total_duration_ms: timeElapsed,
                    animation_detected: this.animationDetected,
                    visual_changes: this.visualChanges,
                    timed_out: isTimeout,
                    stable_frames: this.stableFrames,
                    candidate_count: this.candidates.size
                });
            }
        } else {
            // Continue monitoring
            this.rafId = requestAnimationFrame(() => this._loop());
        }
    }

    /**
     * Compare two measurement snapshots
     * @param {Object} a - Previous snapshot
     * @param {Object} b - Current snapshot
     * @returns {boolean} True if different
     * @private
     */
    _isDifferent(a, b) {
        const { HEIGHT, WIDTH, OPACITY, POSITION } = CONFIG.VISUAL_THRESHOLDS;

        // Size changes
        if (Math.abs(a.rect.width - b.rect.width) > WIDTH) return true;
        if (Math.abs(a.rect.height - b.rect.height) > HEIGHT) return true;

        // Position changes
        if (Math.abs(a.rect.top - b.rect.top) > POSITION) return true;
        if (Math.abs(a.rect.left - b.rect.left) > POSITION) return true;

        // Opacity changes
        if (Math.abs(a.opacity - b.opacity) > OPACITY) return true;

        // Transform, visibility, display changes
        if (a.transform !== b.transform) return true;
        if (a.visibility !== b.visibility) return true;
        if (a.display !== b.display) return true;

        return false;
    }

    /**
     * Get current stabilization status
     * @returns {Object} Status information
     */
    getStatus() {
        return {
            isStabilizing: this.isStabilizing,
            stableFrames: this.stableFrames,
            candidateCount: this.candidates.size,
            animationDetected: this.animationDetected,
            elapsedMs: this.isStabilizing ? Date.now() - this.startTime : 0,
            timeSinceLastChange: this.isStabilizing ? Date.now() - this.lastChangeTime : 0
        };
    }

    /**
     * Force stabilization (for testing or manual control)
     * @returns {Object} Visual changes report
     */
    forceStabilize() {
        if (!this.isStabilizing) return null;

        this.stop();

        const report = {
            stabilized_after_ms: Date.now() - this.lastChangeTime,
            total_duration_ms: Date.now() - this.startTime,
            animation_detected: this.animationDetected,
            visual_changes: this.visualChanges,
            forced: true
        };

        if (this.onStabilized) {
            this.onStabilized(report);
        }

        return report;
    }

    /**
     * Check if element is being monitored
     * @param {Element} el - DOM element
     * @returns {boolean} True if monitored
     */
    isMonitoring(el) {
        return this.candidates.has(el);
    }

    /**
     * Remove element from monitoring
     * @param {Element} el - DOM element to remove
     */
    removeCandidate(el) {
        this.candidates.delete(el);
        this.snapshots.delete(el);
    }

    /**
     * Get count of monitored elements
     * @returns {number} Candidate count
     */
    getCandidateCount() {
        return this.candidates.size;
    }
}
