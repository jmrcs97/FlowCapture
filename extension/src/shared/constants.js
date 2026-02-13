/**
 * FlowCapture - Centralized Configuration
 * All magic numbers and configuration values in one place
 */

export const CONFIG = {
    // Visual change detection thresholds
    VISUAL_THRESHOLDS: {
        HEIGHT: 5,           // Minimum height change in pixels
        WIDTH: 5,            // Minimum width change in pixels
        OPACITY: 0.01,       // Minimum opacity change
        POSITION: 1          // Minimum position change in pixels
    },

    // Layout stabilization settings
    STABILIZATION: {
        MIN_STABLE_FRAMES: 15,      // Consecutive stable frames required
        MIN_WAIT_MS: 500,            // Minimum wait time before declaring stable
        MAX_TIMEOUT_MS: 3000,        // Maximum time to wait for stabilization
        RAF_INTERVAL_MS: 16          // RequestAnimationFrame interval (~60fps)
    },

    // Output limits to keep JSON concise
    LIMITS: {
        MAX_VISUAL_CHANGES: 15,      // Max visual changes per step
        MAX_CLASS_CHANGES: 5,        // Max class attribute changes per step
        MAX_MUTATION_BATCH: 100      // Max mutations to process per RAF
    },

    // Event handling timers
    TIMERS: {
        SCROLL_DEBOUNCE_MS: 150,     // Scroll event debounce delay
        STORAGE_UPDATE_DEBOUNCE: 100 // Storage update debounce
    },

    // Accessibility settings
    ACCESSIBILITY: {
        OVERLAY_ARIA_LABEL: 'FlowCapture Recording Overlay',
        MIN_CONTRAST_RATIO: 4.5      // WCAG AA requirement
    },

    // UI settings
    UI: {
        OVERLAY_Z_INDEX: 2147483647,  // Maximum z-index
        POPUP_WIDTH: 360,
        POPUP_HEIGHT: 520,
        TIMER_UPDATE_INTERVAL: 1000   // Update timer every 1 second
    },

    // Selector generation
    SELECTOR: {
        // Utility class patterns to filter out
        UTILITY_CLASS_PATTERN: /^(d-|flex-|align-|justify-|m[tbrl]?-|p[tbrl]?-|w-|h-|text-|bg-|border-|gap-|show|active|visible)/,
        MAX_SELECTOR_LENGTH: 100      // Maximum selector string length
    },

    // MutationObserver configuration
    MUTATION_OBSERVER: {
        OBSERVE_ATTRIBUTES: ['class', 'style', 'data-state'],
        OBSERVE_CHARACTER_DATA: false,
        THROTTLE_RAF: true            // Use RAF for batching
    },

    // Performance monitoring
    PERFORMANCE: {
        ENABLE_CACHE: true,           // Enable selector caching
        CACHE_TYPE: 'WeakMap',        // Use WeakMap for auto GC
        LOG_PERFORMANCE: false        // Enable performance logging
    },

    // Data export
    EXPORT: {
        VERSION: '2.0-diff-engine',
        SUMMARY: 'Deterministic UI Mutation Log',
        FILE_NAME: 'flow_capture.json',
        INDENT_SPACES: 2
    }
};

/**
 * Message action types for Chrome extension messaging
 */
export const MESSAGE_ACTIONS = {
    TOGGLE_OVERLAY: 'toggleOverlay',
    START_RECORDING: 'startRecording',
    STOP_RECORDING: 'stopRecording',
    CAPTURE_STATE: 'captureState',
    GET_INTENT: 'getIntent',
    INTENT_UPDATED: 'intentUpdated',
    LOG: 'log'
};

/**
 * Visual property priorities for sorting changes
 */
export const VISUAL_PROPERTY_PRIORITY = {
    height: 3,
    width: 3,
    opacity: 2,
    display: 2,
    visibility: 2,
    transform: 1,
    position: 1,
    top: 1,
    left: 1,
    right: 1,
    bottom: 1
};

/**
 * Error messages
 */
export const ERROR_MESSAGES = {
    NO_ACTIVE_TAB: 'No active tab found',
    CONNECTION_FAILED: 'Could not establish connection. Please refresh the page.',
    START_RECORDING_FAILED: 'Failed to start recording',
    STOP_RECORDING_FAILED: 'Failed to stop recording',
    DOWNLOAD_FAILED: 'Could not retrieve data. Page might have been reloaded.',
    CHECKPOINT_FAILED: 'Failed to capture checkpoint',
    STORAGE_ERROR: 'Failed to access browser storage'
};

/**
 * Success messages
 */
export const SUCCESS_MESSAGES = {
    RECORDING_STARTED: 'Recording started successfully',
    RECORDING_STOPPED: 'Recording stopped',
    CHECKPOINT_CAPTURED: 'Checkpoint captured',
    DOWNLOAD_COMPLETE: 'Flow downloaded successfully'
};

/**
 * Storage keys for chrome.storage.local
 */
export const STORAGE_KEYS = {
    IS_RECORDING: 'isRecording',
    START_TIME: 'startTime',
    EVENT_COUNT: 'eventCount',
    INTENT_DATA: 'intentData',
    RECORDED_STEPS: 'recordedSteps'
};
