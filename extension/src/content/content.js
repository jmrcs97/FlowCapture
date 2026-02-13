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
            try {
                // Dynamic imports (required for content scripts in MV3)
                const [
                    { SelectorEngine },
                    { SessionManager },
                    { MutationTracker },
                    { StateManager },
                    { OverlayUI },
                    { CONFIG, MESSAGE_ACTIONS }
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

                // Setup event listeners and message handlers
                this._setupEventListeners(CONFIG);
                this._setupMessageHandlers();

                console.log('FlowCapture: Initialized successfully');
            } catch (error) {
                console.error('FlowCapture: Initialization failed:', error);
            }
        }

        /**
         * Setup DOM event listeners for recording
         * @param {Object} CONFIG - Configuration constants
         * @private
         */
        _setupEventListeners(CONFIG) {
            // Click capture
            document.addEventListener('click', (e) => {
                if (!this.stateManager.isRecording) return;
                try {
                    this.sessionManager.startSession({ type: 'click', target: e.target });
                } catch (err) {
                    console.error('FlowCapture: Click error:', err);
                }
            }, true);

            // Input change capture
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
                        this.sessionManager.startSession({
                            type: 'scroll',
                            target: scrollStart.target,
                            scrollData: {
                                from: { x: scrollStart.x, y: scrollStart.y },
                                to: scrollEnd,
                                delta: { x: scrollEnd.x - scrollStart.x, y: scrollEnd.y - scrollStart.y }
                            }
                        });
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
    flowCapture.init();
}
