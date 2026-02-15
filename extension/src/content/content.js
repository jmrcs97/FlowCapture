/**
 * FlowCapture - Content Script Orchestrator
 * REFACTORED: 868 lines → ~170 lines (80% reduction)
 *
 * This file is the entry point for the content script.
 * It dynamically imports modular components and orchestrates them.
 *
 * Architecture:
 * - SelectorEngine:  CSS selector generation with caching
 * - LayoutStabilizer: Visual change detection with stabilization
 * - SessionManager:   Interaction session lifecycle
 * - MutationTracker:  Optimized MutationObserver wrapper
 * - StateManager:     Centralized recording state
 * - OverlayUI:        Accessible recording overlay
 */

// Guard against double injection
if (window.hasFlowCapture) {
    if (window.overlay) window.overlay.toggle();
} else {
    window.hasFlowCapture = true;

    /**
     * Resolve module URL for dynamic import in content script context
     * @param {string} path - Relative path from extension root
     * @returns {string} Resolved chrome-extension:// URL
     */
    const resolveModule = (path) => chrome.runtime.getURL(path);

    /**
     * Main FlowCapture class - Orchestrates all modules
     */
    class FlowCapture {
        constructor() {
            this.selectorEngine = null;
            this.sessionManager = null;
            this.mutationTracker = null;
            this.stateManager = null;
            this.overlay = null;
            this.recordedSteps = []; // Accessible for download
        }

        /**
         * Initialize all modules via dynamic import
         */
        async init() {
            // Wait for body if not present
            if (!document.body) {
                await new Promise(resolve => {
                    const observer = new MutationObserver(() => {
                        if (document.body) {
                            observer.disconnect();
                            resolve();
                        }
                    });
                    observer.observe(document.documentElement, { childList: true });
                });
            }

            try {
                // Dynamic imports (required for content scripts in MV3)
                const [
                    { SelectorEngine },
                    { SessionManager },
                    { MutationTracker },
                    { StateManager },
                    { OverlayUI },
                    { CONFIG, MESSAGE_ACTIONS, DEFAULT_SETTINGS }
                ] = await Promise.all([
                    import(resolveModule('src/content/core/selector-engine.js')),
                    import(resolveModule('src/content/core/session-manager.js')),
                    import(resolveModule('src/content/core/mutation-tracker.js')),
                    import(resolveModule('src/content/core/state-manager.js')),
                    import(resolveModule('src/content/ui/overlay.js')),
                    import(resolveModule('src/shared/constants.js'))
                ]);

                this.MESSAGE_ACTIONS = MESSAGE_ACTIONS;
                this.CONFIG = CONFIG;

                // Initialize core modules
                this.selectorEngine = new SelectorEngine();
                this.stateManager = new StateManager();

                this.sessionManager = new SessionManager(
                    this.selectorEngine,
                    (stepData) => this._onSessionComplete(stepData)
                );

                this.mutationTracker = new MutationTracker(
                    (mutation) => this.sessionManager.addMutation(mutation)
                );

                // Initialize UI
                this.overlay = new OverlayUI(this.stateManager);
                window.overlay = this.overlay;

                // Check and restore state (page reload recovery)
                const state = await this.stateManager.initialize();
                if (state.isRecording) {
                    this._startRecordingInternal();
                }
                await this.overlay.restoreState();

                // Load settings from storage
                try {
                    const result = await chrome.storage.local.get('fcSettings');
                    const settings = result.fcSettings || {};
                    this.captureShortcut = settings.captureShortcut || DEFAULT_SETTINGS.captureShortcut;
                    this.overlay.setAutoMinimize(settings.autoMinimizeOverlay ?? DEFAULT_SETTINGS.autoMinimizeOverlay);
                    this.overlay.setRecordingIndicatorVisible(settings.showRecordingIndicator ?? DEFAULT_SETTINGS.showRecordingIndicator);
                } catch (e) {
                    this.captureShortcut = DEFAULT_SETTINGS.captureShortcut;
                }

                // Listen for settings changes from popup (live sync)
                chrome.storage.onChanged.addListener((changes, areaName) => {
                    if (areaName === 'local' && changes.fcSettings) {
                        const s = changes.fcSettings.newValue || {};
                        if (s.captureShortcut) this.captureShortcut = s.captureShortcut;
                        if (s.autoMinimizeOverlay !== undefined && this.overlay) {
                            this.overlay.setAutoMinimize(s.autoMinimizeOverlay);
                        }
                        if (s.showRecordingIndicator !== undefined && this.overlay) {
                            this.overlay.setRecordingIndicatorVisible(s.showRecordingIndicator);
                        }
                    }
                });

                // Setup event listeners and message handlers
                this._setupEventListeners(CONFIG);
                this._setupMessageHandlers();

                console.log('FlowCapture: Initialized successfully');
            } catch (error) {
                console.error('FlowCapture: Initialization failed:', {
                    message: error.message,
                    stack: error.stack,
                    error
                });
            }
        }

        /**
         * Setup DOM event listeners for recording
         * @param {Object} CONFIG - Configuration constants
         * @private
         */
        _setupEventListeners(CONFIG) {
            // Click capture with coordinates and modifiers
            document.addEventListener('click', (e) => {
                if (!this.stateManager.isRecording) return;
                try {
                    // Ignore clicks on our own overlay
                    if (e.target.id === 'flow-capture-overlay-root' ||
                        e.target.closest?.('#flow-capture-overlay-root')) return;

                    this.sessionManager.startSession({
                        type: 'click',
                        target: e.target,
                        coordinates: { x: e.clientX, y: e.clientY },
                        modifiers: {
                            ctrl: e.ctrlKey,
                            shift: e.shiftKey,
                            alt: e.altKey,
                            meta: e.metaKey
                        },
                        button: e.button // 0=left, 1=middle, 2=right
                    });
                } catch (err) {
                    console.error('FlowCapture: Click error:', err);
                }
            }, true);

            // Keydown capture (expanded: Enter, Escape, Tab, Space, Arrow keys)
            document.addEventListener('keydown', (e) => {
                if (!this.stateManager.isRecording) return;
                try {
                    // Dynamic shortcut matching (configurable via Settings)
                    const sc = this.captureShortcut;
                    if (sc &&
                        e.ctrlKey === !!sc.ctrl &&
                        e.shiftKey === !!sc.shift &&
                        e.altKey === !!sc.alt &&
                        e.metaKey === !!sc.meta &&
                        e.key.toUpperCase() === sc.key.toUpperCase()
                    ) {
                        e.preventDefault();
                        this._triggerMarkCapture();
                        return;
                    }

                    const captureKeys = ['Enter', 'Escape', 'Tab', ' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

                    if (captureKeys.includes(e.key)) {
                        this.sessionManager.startSession({
                            type: 'keydown',
                            target: e.target,
                            key: e.key,
                            modifiers: {
                                ctrl: e.ctrlKey,
                                shift: e.shiftKey,
                                alt: e.altKey,
                                meta: e.metaKey
                            }
                        });
                    }
                } catch (err) {
                    console.error('FlowCapture: Keydown error:', err);
                }
            }, true);

            // Form submit capture
            document.addEventListener('submit', (e) => {
                if (!this.stateManager.isRecording) return;
                try {
                    this.sessionManager.startSession({ type: 'submit', target: e.target });
                } catch (err) {
                    console.error('FlowCapture: Submit error:', err);
                }
            }, true);

            // Real-time input tracking (debounced 300ms)
            let inputTimeout = null;
            let lastInputValue = new Map();

            document.addEventListener('input', (e) => {
                if (!this.stateManager.isRecording) return;
                try {
                    const target = e.target;
                    if (target.tagName !== 'INPUT' &&
                        target.tagName !== 'TEXTAREA' &&
                        !target.isContentEditable) return;

                    // Skip autofill events (not trusted user input)
                    if (!e.isTrusted) return;

                    // Get current value
                    const currentValue = target.value || target.textContent;

                    // Skip if value hasn't changed (prevents duplicate events)
                    if (lastInputValue.get(target) === currentValue) return;

                    clearTimeout(inputTimeout);
                    inputTimeout = setTimeout(() => {
                        lastInputValue.set(target, currentValue);
                        this.sessionManager.startSession({
                            type: 'input',
                            target: target,
                            value: currentValue
                        });
                    }, 300); // 300ms debounce for typing
                } catch (err) {
                    console.error('FlowCapture: Input error:', err);
                }
            }, true);

            // Input change capture (for checkboxes, radios, selects)
            document.addEventListener('change', (e) => {
                if (!this.stateManager.isRecording) return;
                try {
                    const t = e.target;
                    if (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') {
                        let val = t.value;
                        if (t.type === 'checkbox' || t.type === 'radio') val = t.checked;
                        this.sessionManager.startSession({ type: 'input_change', target: t, value: val });
                    }
                } catch (err) {
                    console.error('FlowCapture: Change error:', err);
                }
            }, true);

            // Focus tracking (for form field navigation)
            document.addEventListener('focus', (e) => {
                if (!this.stateManager.isRecording) return;
                try {
                    const target = e.target;
                    // Only track focus on interactive elements
                    if (target.tagName === 'INPUT' ||
                        target.tagName === 'TEXTAREA' ||
                        target.tagName === 'SELECT' ||
                        target.isContentEditable) {
                        this.sessionManager.startSession({
                            type: 'focus',
                            target: target
                        });
                    }
                } catch (err) {
                    console.error('FlowCapture: Focus error:', err);
                }
            }, true);

            // Scroll capture with debounce
            let scrollTimeout = null;
            let scrollStart = null;

            document.addEventListener('scroll', (e) => {
                if (!this.stateManager.isRecording) return;
                try {
                    if (!scrollStart) {
                        scrollStart = {
                            x: window.scrollX,
                            y: window.scrollY,
                            target: e.target === document ? document.documentElement : e.target
                        };
                    }

                    if (scrollTimeout) clearTimeout(scrollTimeout);

                    scrollTimeout = setTimeout(() => {
                        const scrollEnd = { x: window.scrollX, y: window.scrollY };
                        const deltaX = scrollEnd.x - scrollStart.x;
                        const deltaY = scrollEnd.y - scrollStart.y;

                        // Only record if scroll delta > 100px (filter noise)
                        if (Math.abs(deltaY) > 100 || Math.abs(deltaX) > 100) {
                            this.sessionManager.startSession({
                                type: 'scroll',
                                target: scrollStart.target,
                                scrollData: {
                                    from: { x: scrollStart.x, y: scrollStart.y },
                                    to: scrollEnd,
                                    delta: { x: deltaX, y: deltaY }
                                }
                            });
                        }
                        scrollStart = null;
                    }, CONFIG.TIMERS.SCROLL_DEBOUNCE_MS);
                } catch (err) {
                    console.error('FlowCapture: Scroll error:', err);
                }
            }, true);
        }

        /**
         * Setup Chrome message handlers
         * @private
         */
        _setupMessageHandlers() {
            chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
                try {
                    this._handleMessage(request, sendResponse);
                } catch (e) {
                    console.error('FlowCapture: Message error:', e);
                    sendResponse({ status: 'error', message: e.message });
                }
                return true; // Keep message channel open for async
            });
        }

        /**
         * Handle incoming Chrome messages
         * @param {Object} request - Message object
         * @param {Function} sendResponse - Response callback
         * @private
         */
        async _handleMessage(request, sendResponse) {
            const { MESSAGE_ACTIONS } = this;

            switch (request.action) {
                case MESSAGE_ACTIONS.TOGGLE_OVERLAY:
                    if (this.overlay) this.overlay.toggle();
                    sendResponse({ status: 'toggled' });
                    break;

                case MESSAGE_ACTIONS.START_RECORDING:
                    await this.stateManager.startRecording();
                    this._startRecordingInternal();
                    this.overlay.updateUI(true, 0);
                    this.overlay.show();
                    this.overlay.startTimer(this.stateManager.startTime);
                    sendResponse({ status: 'started' });
                    break;

                case MESSAGE_ACTIONS.STOP_RECORDING:
                    this.sessionManager.finalizeCurrentSession();
                    const count = await this.stateManager.stopRecording();
                    this.mutationTracker.stop();
                    this.overlay.updateUI(false, count);
                    this.overlay.stopTimer();
                    if (count > 0) this.overlay.showDownloadButton(count);
                    sendResponse({ status: 'stopped', count });
                    break;

                case MESSAGE_ACTIONS.CAPTURE_STATE:
                    this.sessionManager.finalizeCurrentSession();
                    this.sessionManager.startSession({ type: 'checkpoint', target: document.body });
                    sendResponse({ status: 'captured' });
                    break;

                case MESSAGE_ACTIONS.MARK_CAPTURE:
                    this._triggerMarkCapture();
                    sendResponse({ status: 'marked' });
                    break;

                case MESSAGE_ACTIONS.GET_INTENT:
                    const { DownloadManager } = await import(resolveModule('src/shared/download.js'));
                    const intent = DownloadManager.createIntent(
                        window.location.href,
                        this.stateManager.getSteps()
                    );
                    sendResponse({ intent });
                    break;

                default:
                    sendResponse({ status: 'unknown_action' });
            }
        }

        /**
         * Start recording (internal - starts observer)
         * @private
         */
        _startRecordingInternal() {
            this.mutationTracker.start();
        }

        /**
         * Public: Start recording (called from overlay)
         */
        async startRecording() {
            await this.stateManager.startRecording();
            this._startRecordingInternal();
            this.overlay.updateUI(true, 0);
            this.overlay.show();
            this.overlay.startTimer(this.stateManager.startTime);
        }

        /**
         * Public: Stop recording (called from overlay)
         * @returns {Promise<number>} step count
         */
        async stopRecording() {
            this.sessionManager.finalizeCurrentSession();
            const count = await this.stateManager.stopRecording();
            this.mutationTracker.stop();
            this.overlay.updateUI(false, count);
            this.overlay.stopTimer();
            if (count > 0) this.overlay.showDownloadButton(count);
            return count;
        }

        /**
         * Trigger mark capture (via keyboard shortcut or popup button)
         * @private
         */
        _triggerMarkCapture() {
            if (!this.stateManager.isRecording) {
                console.warn('FlowCapture: Cannot mark capture - not recording');
                return;
            }

            // Gera label automático com timestamp
            const now = new Date();
            const time = now.toLocaleTimeString('en-US', { hour12: false, timeZone: 'UTC' });
            const label = `Capture ${time}`;

            // Usa markCapture do window se disponível, senão cria session diretamente
            if (window.markCapture && typeof window.markCapture === 'function') {
                window.markCapture(label);
            } else {
                this.sessionManager.startSession({
                    type: 'capture_point',
                    target: document.body,
                    captureLabel: label
                });
            }

            console.log(`📸 FlowCapture: Marked via shortcut/button - "${label}"`);
        }

        /**
         * Handle completed interaction session
         * @param {Object} stepData - Captured step data
         * @private
         */
        _onSessionComplete(stepData) {
            const count = this.stateManager.addStep(stepData);

            // Keep local reference for downloads
            this.recordedSteps = this.stateManager.getSteps();

            // Update overlay
            if (this.overlay) {
                this.overlay.updateCount(count);
            }

            // Notify popup
            this.stateManager.notifyPopup(count);

            console.log('FlowCapture: Step captured', stepData.step_id);
        }
    }

    // Initialize FlowCapture
    const flowCapture = new FlowCapture();
    window.flowCapture = flowCapture;
    flowCapture.init().then(() => {
        // Load style capture helpers (console commands)
        import(resolveModule('src/content/helpers/style-capture.js'))
            .catch(err => console.warn('FlowCapture: Style helpers not loaded:', err));
    });
}
