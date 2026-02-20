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
                    this.expandShortcut = settings.expandShortcut || DEFAULT_SETTINGS.expandShortcut;
                    this.manualExpandStep = settings.manualExpandStep || DEFAULT_SETTINGS.manualExpandStep || 50;
                    this.overlay.setAutoMinimize(settings.autoMinimizeOverlay ?? DEFAULT_SETTINGS.autoMinimizeOverlay);
                    this.overlay.setRecordingIndicatorVisible(settings.showRecordingIndicator ?? DEFAULT_SETTINGS.showRecordingIndicator);
                } catch (e) {
                    this.captureShortcut = DEFAULT_SETTINGS.captureShortcut;
                    this.expandShortcut = DEFAULT_SETTINGS.expandShortcut;
                }

                // Listen for settings changes from popup (live sync)
                chrome.storage.onChanged.addListener((changes, areaName) => {
                    if (areaName === 'local' && changes.fcSettings) {
                        const s = changes.fcSettings.newValue || {};
                        if (s.captureShortcut) this.captureShortcut = s.captureShortcut;
                        if (s.expandShortcut) this.expandShortcut = s.expandShortcut;
                        if (s.manualExpandStep) this.manualExpandStep = s.manualExpandStep;
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
            // Mouse position tracking for expand shortcut (passive, only during recording)
            this._mouseX = 0;
            this._mouseY = 0;
            document.addEventListener('mousemove', (e) => {
                if (!this.stateManager.isRecording) return;
                this._mouseX = e.clientX;
                this._mouseY = e.clientY;
            }, { passive: true, capture: true });

            // Track expanded elements for undo/toggle
            this._expandedElements = new WeakMap();

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

                    // Expand shortcut matching
                    const es = this.expandShortcut;
                    if (es &&
                        e.ctrlKey === !!es.ctrl &&
                        e.shiftKey === !!es.shift &&
                        e.altKey === !!es.alt &&
                        e.metaKey === !!es.meta &&
                        e.key.toUpperCase() === es.key.toUpperCase()
                    ) {
                        e.preventDefault();
                        this._triggerExpandUnderCursor();
                        return;
                    }

                    // Manual height adjustment (Ctrl+Shift+Up/Down)
                    if (e.ctrlKey && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                        e.preventDefault();
                        e.stopPropagation();
                        // Up = increase height, Down = decrease
                        const step = this.manualExpandStep || 50;
                        const delta = e.key === 'ArrowUp' ? step : -step;
                        this._adjustExpandedHeight(delta);
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
            // WeakMap: keys are DOM elements — entries are GC'd automatically when elements are removed
            let inputTimeout = null;
            const lastInputValue = new WeakMap();

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
            this._showActionIcon('capture');
        }

        /**
         * Expand the constrained container under the cursor.
         * If the element was already expanded, undo the expansion (toggle).
         * @private
         */
        _triggerExpandUnderCursor() {
            if (!this.stateManager.isRecording) {
                console.warn('FlowCapture: Cannot expand - not recording');
                return;
            }

            // Get element under cursor
            const el = document.elementFromPoint(this._mouseX, this._mouseY);
            if (!el || el.id === 'flow-capture-overlay-root' || el.closest?.('#flow-capture-overlay-root')) {
                console.warn('FlowCapture: No expandable element under cursor');
                this._showExpandFeedback(null, false);
                return;
            }

            // Find nearest constrained container
            const container = this._findConstrainedContainer(el);
            if (!container) {
                // Check if element itself or an ancestor was previously expanded (for undo)
                const undone = this._tryUndoExpand(el);
                if (undone) return;

                console.warn('FlowCapture: No constrained container found near cursor');
                this._showExpandFeedback(el, false);
                return;
            }

            // Check if this container was already expanded → undo
            if (this._expandedElements.has(container)) {
                this._undoExpansion(container);
                return;
            }

            // Apply live CSS expansion
            const originalStyles = this._applyExpansion(container);

            // Store for undo and manual adjustment
            this._expandedElements.set(container, originalStyles);
            this._lastExpandedElement = container;

            // Generate selector for recording
            const selector = this.selectorEngine.getUniqueSelector(container);

            // Record as 'expand' event
            this.sessionManager.startSession({
                type: 'expand',
                target: container,
                expandParams: {
                    selector,
                    mode: 'fit-content',
                    clearAncestorConstraints: true,
                    appliedHeight: container.style.height
                }
            });

            // Show visual feedback
            this._showExpandFeedback(container, true);
            this.overlay.showToast(`Expanded: ${Math.round(container.getBoundingClientRect().height)}px`, 'success');
            this._showActionIcon('expand');

            console.log(`📐 FlowCapture: Expanded ${selector} (${container.scrollHeight}px)`);
        }

        /**
         * Monitor manual height adjustments to debounce recording
         * @private
         */
        _recordHeightAdjustment(el, height) {
            if (this._heightAdjustmentTimeout) clearTimeout(this._heightAdjustmentTimeout);

            this._heightAdjustmentTimeout = setTimeout(() => {
                const selector = this.selectorEngine.getUniqueSelector(el);
                // Use EXPAND (absolute) instead of SET_STYLE to ensure ancestor limitations are cleared during replay
                this.sessionManager.startSession({
                    type: 'expand',
                    target: el,
                    expandParams: {
                        selector,
                        mode: 'absolute',
                        value: height,
                        clearAncestorConstraints: true
                    }
                });
                console.log(`📏 Recorded manual height adjustment (EXPAND absolute): ${height}px`);
            }, 600);
        }

        /**
         * Manually adjust height of the last expanded element
         * @param {number} delta - pixels to add/remove
         * @private
         */
        _adjustExpandedHeight(delta) {
            const el = this._lastExpandedElement;
            // Check if element is still valid and was expanded by us
            if (!el || !this._expandedElements.has(el)) {
                this.overlay.showToast('Select an element to expand first (Ctrl+Shift+E)', 'error');
                return;
            }

            const currentRect = el.getBoundingClientRect();
            const currentHeight = currentRect.height;
            const newHeight = Math.max(50, currentHeight + delta); // Min 50px

            el.style.setProperty('height', `${newHeight}px`, 'important');

            // Show toast with new height
            this.overlay.showToast(`Height: ${Math.round(newHeight)}px`, 'info', 1000); // Short duration for rapid updates
            this._showExpandFeedback(el, true);
            this._showActionIcon(delta > 0 ? 'adjust-up' : 'adjust-down');

            // Record the change
            this._recordHeightAdjustment(el, newHeight);
        }

        /**
         * Walk up from element to find nearest constrained container.
         * A container is "constrained" if scrollHeight > clientHeight + threshold.
         * Skips <html> and <body>.
         * @param {Element} startEl
         * @returns {Element|null}
         * @private
         */
        _findConstrainedContainer(startEl) {
            let el = startEl;
            const threshold = 5;

            while (el && el !== document.documentElement && el !== document.body) {
                if (el.scrollHeight > el.clientHeight + threshold) {
                    const cs = getComputedStyle(el);
                    const hasFixedHeight = cs.height !== 'auto' && cs.height !== '';
                    const hasMaxHeight = cs.maxHeight !== 'none' && cs.maxHeight !== '';
                    const hasOverflowClip = cs.overflow === 'hidden' || cs.overflowY === 'hidden'
                        || cs.overflow === 'auto' || cs.overflowY === 'auto'
                        || cs.overflow === 'scroll' || cs.overflowY === 'scroll';

                    if (hasFixedHeight || hasMaxHeight || hasOverflowClip) {
                        return el;
                    }
                }
                el = el.parentElement;
            }

            // Fallback: startEl itself if it has fixed height or max-height
            const cs = getComputedStyle(startEl);
            if (cs.height !== 'auto' || cs.maxHeight !== 'none') {
                return startEl;
            }

            return null;
        }

        /**
         * Apply expansion CSS to a container + clear ancestor constraints.
         * @param {Element} container
         * @returns {Object} Snapshot of original style values for undo
         * @private
         */
        _applyExpansion(container) {
            const originalStyles = {
                container: {
                    height: container.style.height,
                    maxHeight: container.style.maxHeight,
                    overflow: container.style.overflow,
                    overflowY: container.style.overflowY
                },
                ancestors: []
            };

            // Expand the container
            const targetHeight = container.scrollHeight;
            container.style.setProperty('height', `${targetHeight}px`, 'important');
            container.style.setProperty('max-height', 'none', 'important');
            container.style.setProperty('overflow', 'visible', 'important');

            // Walk up ancestors and clear height/max-height/overflow constraints
            let ancestor = container.parentElement;
            let depth = 0;
            const maxDepth = 10;

            while (ancestor && ancestor !== document.documentElement && depth < maxDepth) {
                const cs = getComputedStyle(ancestor);
                const needsClear = (
                    (cs.height !== 'auto' && cs.height !== '') ||
                    (cs.maxHeight !== 'none' && cs.maxHeight !== '') ||
                    cs.overflow === 'hidden' || cs.overflowY === 'hidden'
                );

                if (needsClear) {
                    originalStyles.ancestors.push({
                        element: ancestor,
                        height: ancestor.style.height,
                        maxHeight: ancestor.style.maxHeight,
                        overflow: ancestor.style.overflow,
                        overflowY: ancestor.style.overflowY
                    });

                    ancestor.style.setProperty('height', 'auto', 'important');
                    ancestor.style.setProperty('max-height', 'none', 'important');
                    ancestor.style.setProperty('overflow', 'visible', 'important');
                }

                ancestor = ancestor.parentElement;
                depth++;
            }

            return originalStyles;
        }

        /**
         * Undo a previous expansion, restoring original CSS.
         * @param {Element} container
         * @private
         */
        _undoExpansion(container) {
            const saved = this._expandedElements.get(container);
            if (!saved) return;

            // Restore container styles
            const c = saved.container;
            container.style.height = c.height;
            container.style.maxHeight = c.maxHeight;
            container.style.overflow = c.overflow;
            container.style.overflowY = c.overflowY;

            // Restore ancestor styles
            for (const a of saved.ancestors) {
                a.element.style.height = a.height;
                a.element.style.maxHeight = a.maxHeight;
                a.element.style.overflow = a.overflow;
                a.element.style.overflowY = a.overflowY;
            }

            this._expandedElements.delete(container);
            this._showExpandFeedback(container, false, true);

            const selector = this.selectorEngine.getUniqueSelector(container);
            console.log(`↩️ FlowCapture: Undid expansion on ${selector}`);
        }

        /**
         * Try to undo expansion on the element or any ancestor.
         * Used when _findConstrainedContainer returns null (element already expanded).
         * @param {Element} startEl
         * @returns {boolean} True if an undo was performed
         * @private
         */
        _tryUndoExpand(startEl) {
            let el = startEl;
            while (el && el !== document.documentElement) {
                if (this._expandedElements.has(el)) {
                    this._undoExpansion(el);
                    return true;
                }
                el = el.parentElement;
            }
            return false;
        }

        /**
         * Show floating action icon above overlay for shortcut feedback.
         * @param {string} iconType - 'capture' | 'expand' | 'adjust-up' | 'adjust-down'
         * @private
         */
        _showActionIcon(iconType) {
            // Icon characters
            const icons = {
                'capture': '📸',
                'expand': '📐',
                'adjust-up': '⬆️',
                'adjust-down': '⬇️'
            };

            const icon = icons[iconType] || '✓';

            // Create floating icon element
            const iconEl = document.createElement('div');
            iconEl.textContent = icon;
            iconEl.style.cssText = `
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                font-size: 48px;
                background: rgba(0, 0, 0, 0.8);
                padding: 16px 24px;
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
                z-index: 2147483646;
                pointer-events: none;
                animation: fc-icon-fade 2s ease-out forwards;
            `;

            // Add animation CSS if not exists
            if (!document.getElementById('fc-icon-animation')) {
                const style = document.createElement('style');
                style.id = 'fc-icon-animation';
                style.textContent = `
                    @keyframes fc-icon-fade {
                        0% { opacity: 1; transform: translateX(-50%) translateY(0); }
                        70% { opacity: 1; }
                        100% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
                    }
                `;
                document.head.appendChild(style);
            }

            document.body.appendChild(iconEl);

            // Remove after animation
            setTimeout(() => iconEl.remove(), 2000);
        }

        /**
         * Show brief visual feedback on an element.
         * @param {Element|null} el
         * @param {boolean} success - true = expanded, false = failed or undone
         * @param {boolean} isUndo - true if this is an undo feedback
         * @private
         */
        _showExpandFeedback(el, success, isUndo = false) {
            if (!el) return;

            const origOutline = el.style.outline;
            const origTransition = el.style.transition;

            if (isUndo) {
                el.style.outline = '3px solid #f59e0b'; // amber = undone
            } else {
                el.style.outline = success
                    ? '3px solid #22c55e'  // green = expanded
                    : '3px solid #ef4444'; // red = failed
            }
            el.style.transition = 'outline 0.3s ease';

            setTimeout(() => {
                el.style.outline = origOutline;
                el.style.transition = origTransition;
            }, 1500);
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
