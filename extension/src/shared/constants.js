/**
 * FlowCapture - Configuração centralizada
 */

export const CONFIG = {
    // Estabilização de layout
    STABILIZATION: {
        LAYOUT_DELTA: 0.5,          // px — delta abaixo disso = frame estável
        MIN_STABLE_FRAMES: 15,      // frames consecutivos estáveis pra declarar estável
        MIN_WAIT_MS: 500,           // tempo mínimo antes de declarar estável
        MAX_TIMEOUT_MS: 3000        // timeout máximo de estabilização
    },

    // Limites de output
    LIMITS: {
        MAX_CLASS_CHANGES: 5,
        MAX_MUTATION_BATCH: 100
    },

    // Timers de eventos
    TIMERS: {
        SCROLL_DEBOUNCE_MS: 150,
        STORAGE_UPDATE_DEBOUNCE: 100
    },

    // Acessibilidade
    ACCESSIBILITY: {
        OVERLAY_ARIA_LABEL: 'FlowCapture Recording Overlay',
        MIN_CONTRAST_RATIO: 4.5
    },

    // UI
    UI: {
        OVERLAY_Z_INDEX: 2147483647,
        POPUP_WIDTH: 360,
        POPUP_HEIGHT: 520,
        TIMER_UPDATE_INTERVAL: 1000
    },

    // Geração de seletores
    SELECTOR: {
        // Fixed: removed 'show', 'active', 'visible' - these are semantic, not utility classes
        UTILITY_CLASS_PATTERN: /^(d-|flex-|align-|justify-|m[tbrl]?-|p[tbrl]?-|w-|h-|text-|bg-|border-|gap-)/,
        MAX_SELECTOR_LENGTH: 100
    },

    // MutationObserver
    MUTATION_OBSERVER: {
        OBSERVE_ATTRIBUTES: ['class', 'style', 'data-state'],
        OBSERVE_CHARACTER_DATA: false,
        THROTTLE_RAF: true
    },

    // Performance
    PERFORMANCE: {
        ENABLE_CACHE: true,
        CACHE_TYPE: 'WeakMap',
        LOG_PERFORMANCE: false
    },

    // Export
    EXPORT: {
        VERSION: '4.0-workflow-engine',
        SUMMARY: 'Executable Workflow Steps',
        FILE_NAME: 'workflow.json',
        INDENT_SPACES: 2
    }
};

export const MESSAGE_ACTIONS = {
    TOGGLE_OVERLAY: 'toggleOverlay',
    START_RECORDING: 'startRecording',
    STOP_RECORDING: 'stopRecording',
    CAPTURE_STATE: 'captureState',
    MARK_CAPTURE: 'markCapture',
    GET_INTENT: 'getIntent',
    INTENT_UPDATED: 'intentUpdated',
    LOG: 'log'
};

export const ERROR_MESSAGES = {
    NO_ACTIVE_TAB: 'No active tab found',
    CONNECTION_FAILED: 'Could not establish connection. Please refresh the page.',
    START_RECORDING_FAILED: 'Failed to start recording',
    STOP_RECORDING_FAILED: 'Failed to stop recording',
    DOWNLOAD_FAILED: 'Could not retrieve data. Page might have been reloaded.',
    CHECKPOINT_FAILED: 'Failed to capture checkpoint',
    STORAGE_ERROR: 'Failed to access browser storage'
};

export const SUCCESS_MESSAGES = {
    RECORDING_STARTED: 'Recording started successfully',
    RECORDING_STOPPED: 'Recording stopped',
    CHECKPOINT_CAPTURED: 'Checkpoint captured',
    DOWNLOAD_COMPLETE: 'Flow downloaded successfully'
};

export const STORAGE_KEYS = {
    IS_RECORDING: 'isRecording',
    START_TIME: 'startTime',
    EVENT_COUNT: 'eventCount',
    INTENT_DATA: 'intentData',
    RECORDED_STEPS: 'recordedSteps',
    SETTINGS: 'fcSettings'
};

export const DEFAULT_SETTINGS = {
    captureShortcut: { ctrl: true, shift: true, key: 'C' },
    expandShortcut: { ctrl: true, shift: true, key: 'E' },
    defaultExportFormat: 'workflow',
    autoMinimizeOverlay: true,
    showRecordingIndicator: true,
    manualExpandStep: 50,
    screenshotMode: 'dynamic', // 'dynamic' | 'fullpage' | 'viewport'
    viewportPreset: 'desktop' // 'desktop' | 'mobile'
};
