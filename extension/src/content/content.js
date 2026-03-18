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
                    { ShortcutMatcher },
                    { VisualFeedback },
                    { ExpansionManager },
                    { CONFIG, MESSAGE_ACTIONS, DEFAULT_SETTINGS }
                ] = await Promise.all([
                    import(resolveModule('src/content/core/selector-engine.js')),
                    import(resolveModule('src/content/core/session-manager.js')),
                    import(resolveModule('src/content/core/mutation-tracker.js')),
                    import(resolveModule('src/content/core/state-manager.js')),
                    import(resolveModule('src/content/ui/overlay.js')),
                    import(resolveModule('src/content/services/shortcut-matcher.js')),
                    import(resolveModule('src/content/ui/visual-feedback.js')),
                    import(resolveModule('src/content/services/expansion-manager.js')),
                    import(resolveModule('src/shared/constants.js'))
                ]);

                this.MESSAGE_ACTIONS = MESSAGE_ACTIONS;
                this.CONFIG = CONFIG;
                this.ShortcutMatcher = ShortcutMatcher;

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

                // Initialize services
                this.visualFeedback = new VisualFeedback();
                this.visualFeedback.initializeAnimations();

                this.expansionManager = new ExpansionManager(
                    this.selectorEngine,
                    this.sessionManager
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

            // Hover capture (selective + debounced)
            // Goal: support dropdown nav that requires hover to reveal submenu.
            // We only record hover when it looks like a menu trigger OR when hover
            // produces measurable visual effects (handled downstream by compiler heuristics).
            let hoverTimer = null;
            let lastHoverEl = null;
            let lastHoverTs = 0;
            const HOVER_DEBOUNCE_MS = 320;
            const HOVER_COOLDOWN_MS = 1200;

            const isLikelyMenuTrigger = (el) => {
                if (!el || el.nodeType !== 1) return false;
                const a = el.closest?.('a, button, [role="button"], [role="menuitem"], [aria-haspopup], [aria-expanded]') || el;
                if (!a || a.nodeType !== 1) return false;

                const hasPopup = a.getAttribute?.('aria-haspopup');
                const hasExpanded = a.getAttribute?.('aria-expanded') !== null;
                const role = (a.getAttribute?.('role') || '').toLowerCase();
                const tag = (a.tagName || '').toLowerCase();
                const cls = (a.className || '').toString();

                // Common dropdown patterns
                if (hasPopup) return true;
                if (hasExpanded) return true;
                if (role.includes('menuitem')) return true;
                if (/dropdown|nav.*dropdown|menu/i.test(cls)) return true;

                // Heuristic: link/button with a caret/arrow icon inside
                if (tag === 'a' || tag === 'button' || role === 'button') {
                    const icon = a.querySelector?.('svg, i, span');
                    const txt = (a.innerText || a.textContent || '').trim();
                    if (icon && /▾|▼|chevron|caret/i.test(icon.className || '') ) return true;
                    if (/about|menu|more/i.test(txt)) return true;
                }

                return false;
            };

            document.addEventListener('pointerenter', (e) => {
                if (!this.stateManager.isRecording) return;
                try {
                    const target = e.target;
                    if (!target || target.nodeType !== 1) return;

                    // Ignore our overlay
                    if (target.id === 'flow-capture-overlay-root' ||
                        target.closest?.('#flow-capture-overlay-root')) return;

                    // Reduce noise: only consider likely menu triggers
                    if (!isLikelyMenuTrigger(target)) return;

                    const now = Date.now();
                    if (lastHoverEl === target && (now - lastHoverTs) < HOVER_COOLDOWN_MS) return;

                    if (hoverTimer) clearTimeout(hoverTimer);
                    hoverTimer = setTimeout(() => {
                        lastHoverEl = target;
                        lastHoverTs = Date.now();

                        this.sessionManager.startSession({
                            type: 'hover',
                            target,
                            coordinates: { x: this._mouseX || 0, y: this._mouseY || 0 }
                        });
                    }, HOVER_DEBOUNCE_MS);
                } catch (err) {
                    console.error('FlowCapture: Hover error:', err);
                }
            }, { capture: true, passive: true });

            // Click capture with coordinates and modifiers
            document.addEventListener('click', (e) => {
                if (!this.stateManager.isRecording) return;
                try {
                    // Ignore clicks on our own overlay
                    if (e.target.id === 'flow-capture-overlay-root' ||
                        e.target.closest?.('#flow-capture-overlay-root')) return;

                    // Validate if click should be recorded (filter wrappers)
                    if (!this._shouldRecordClick(e.target)) {
                        console.log(`⏭️ FlowCapture: Skipped non-interactive click on <${e.target.tagName}>`);
                        return;
                    }

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
                    // Capture shortcut (configurable via Settings)
                    if (this.ShortcutMatcher.isCapture(e, this.captureShortcut)) {
                        e.preventDefault();
                        this._triggerMarkCapture();
                        return;
                    }

                    // Expand shortcut
                    if (this.ShortcutMatcher.isExpand(e, this.expandShortcut)) {
                        e.preventDefault();
                        this._triggerExpandUnderCursor();
                        return;
                    }

                    // Manual height adjustment (Ctrl+Shift+Up/Down)
                    if (this.ShortcutMatcher.isHeightAdjustment(e)) {
                        e.preventDefault();
                        e.stopPropagation();
                        const delta = this.ShortcutMatcher.getHeightDelta(e, this.manualExpandStep || 50);
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

            // ─── URL / Navigation change detection ───────────────────────────
            // Covers three cases:
            //   1. Traditional page navigation (popstate: back/forward/links)
            //   2. Hash-only changes (hashchange)
            //   3. SPA pushState navigation (React Router, Next.js, etc.)
            //
            // We record a 'navigation' step so WorkflowCompiler emits a GOTO node.
            // A small debounce prevents duplicate events when pushState + popstate
            // fire together in some frameworks.

            let lastRecordedUrl = window.location.href;
            let navDebounceTimer = null;
            const NAV_DEBOUNCE_MS = 150;

            const recordNavigation = (newUrl) => {
                if (!this.stateManager.isRecording) return;
                if (newUrl === lastRecordedUrl) return;

                clearTimeout(navDebounceTimer);
                navDebounceTimer = setTimeout(() => {
                    if (newUrl === lastRecordedUrl) return; // re-check inside timer
                    console.log(`🧭 FlowCapture: Navigation detected → ${newUrl}`);
                    lastRecordedUrl = newUrl;

                    this.sessionManager.startSession({
                        type: 'navigation',
                        target: document.body,
                        url: newUrl
                    });
                }, NAV_DEBOUNCE_MS);
            };

            // popstate: browser back/forward + link clicks that trigger history
            window.addEventListener('popstate', () => {
                recordNavigation(window.location.href);
            });

            // hashchange: anchor jumps (#section)
            window.addEventListener('hashchange', () => {
                recordNavigation(window.location.href);
            });

            // Intercept history.pushState & replaceState for SPA routing
            const _patchHistoryMethod = (methodName) => {
                const original = history[methodName];
                history[methodName] = function (...args) {
                    const result = original.apply(this, args);
                    // URL is updated synchronously after the call
                    recordNavigation(window.location.href);
                    return result;
                };
            };

            // Only patch once (guard against re-injection)
            if (!window.__fcHistoryPatched) {
                window.__fcHistoryPatched = true;
                _patchHistoryMethod('pushState');
                _patchHistoryMethod('replaceState');
            }
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
                    if (count > 0) {
                        this.overlay.showDownloadButton(count);
                        // Auto-sync to Screenshot Tool API
                        this._syncToApi().catch(err => console.error('FlowCapture: Sync failed:', err));
                    }
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
            if (count > 0) {
                this.overlay.showDownloadButton(count);
                // Auto-sync to Screenshot Tool API
                this._syncToApi().catch(err => console.error('FlowCapture: Sync failed:', err));
            }
            return count;
        }

        /**
         * Sync captured workflow to the screenshot-tool backend
         * @private
         */
        async _syncToApi() {
            try {
                const steps = this.stateManager.getSteps();
                if (!steps || steps.length === 0) return;

                const url = window.location.href;
                const rootUrl = new URL(url).hostname;
                const now = new Date();
                const dateStr = now.toLocaleDateString('pt-BR');
                const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                
                const workflowName = `${dateStr} ${timeStr} - ${rootUrl}`;

                const { DownloadManager } = await import(resolveModule('src/shared/download.js'));
                const workflow = DownloadManager.createWorkflow(url, steps);

                if (this.overlay) this.overlay.showToast('Enviando para Screenshot Tool...', 'info');

                chrome.runtime.sendMessage({
                    type: 'SYNC_WORKFLOW',
                    data: {
                        name: workflowName,
                        url: url,
                        workflow: workflow
                    }
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error('FlowCapture: Sync error (runtime):', chrome.runtime.lastError);
                        if (this.overlay) this.overlay.showToast('Erro de comunicação na extensão', 'error');
                        return;
                    }

                    if (response && response.success) {
                        console.log('FlowCapture: Sync successful', response.data);
                        if (this.overlay) this.overlay.showToast('Sincronizado com sucesso!', 'success');
                    } else {
                        console.error('FlowCapture: Sync failed (response):', response?.error);
                        if (this.overlay) this.overlay.showToast('Falha ao sincronizar com API', 'error');
                    }
                });
            } catch (error) {
                console.error('FlowCapture: Sync failed', error);
                if (this.overlay) this.overlay.showToast('Falha ao gerar workflow', 'error');
            }
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
            this.visualFeedback.showActionIcon('capture');
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
                this.visualFeedback.showElementOutline(null, 'error');
                return;
            }

            // Find nearest constrained container
            const container = this.expansionManager.findConstrainedContainer(el);
            if (!container) {
                // Check if element itself or an ancestor was previously expanded (for undo)
                if (this.expansionManager.tryUndo(el)) return;

                console.warn('FlowCapture: No constrained container found near cursor');
                this.visualFeedback.showElementOutline(el, 'error');
                return;
            }

            // Check if this container was already expanded → undo
            if (this.expansionManager.isExpanded(container)) {
                this.expansionManager.undo(container);
                this.visualFeedback.showElementOutline(container, 'undo');
                return;
            }

            // Apply live CSS expansion + record
            this.expansionManager.expandElement(container, {
                mode: 'scroll-measure',
                clearAncestorConstraints: true
            });

            // Show visual feedback
            this.visualFeedback.showElementOutline(container, 'success');
            this.overlay.showToast(`Expanded: ${Math.round(container.getBoundingClientRect().height)}px`, 'success');
            this.visualFeedback.showActionIcon('expand');

            const selector = this.selectorEngine.getUniqueSelector(container);
            console.log(`📐 FlowCapture: Expanded ${selector} (${container.scrollHeight}px)`);
        }

        /**
         * Manually adjust height of the last expanded element
         * @param {number} delta - pixels to add/remove
         * @private
         */
        _adjustExpandedHeight(delta) {
            const success = this.expansionManager.adjustHeight(null, delta);

            if (!success) {
                this.overlay.showToast('Select an element to expand first (Ctrl+Shift+E)', 'error');
                return;
            }

            const el = this.expansionManager.getLastExpandedElement();
            const newHeight = el.getBoundingClientRect().height;

            // Show toast with new height
            this.overlay.showToast(`Height: ${Math.round(newHeight)}px`, 'info', 1000);
            this.visualFeedback.showElementOutline(el, 'success');
            this.visualFeedback.showActionIcon(delta > 0 ? 'adjust-up' : 'adjust-down');
        }


        /**
         * Validate if a click should be recorded (filter out wrapper elements)
         * @param {Element} target - The clicked element
         * @returns {boolean} - True if click should be recorded
         * @private
         */
        _shouldRecordClick(target) {
            // Always record clicks on interactive elements
            const interactiveElements = /^(A|BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY|DETAILS)$/i;
            if (interactiveElements.test(target.tagName)) {
                return true;
            }

            // Check for ARIA interactive roles
            const role = target.getAttribute('role');
            if (role && /^(button|link|checkbox|radio|tab|menuitem|option|switch)$/i.test(role)) {
                return true;
            }

            // Check for explicit click handlers (direct event listeners)
            if (target.onclick || target.hasAttribute('onclick')) {
                return true;
            }

            // Check if element has meaningful attributes (likely intentional)
            if (target.id || target.hasAttribute('data-action') || target.hasAttribute('data-toggle')) {
                return true;
            }

            // Reject pure wrapper elements (common false positives)
            const wrapperPatterns = [
                /^slick-(track|list|slide)$/i,        // Carousel wrappers
                /^modal-(content|dialog|backdrop)$/i, // Modal wrappers
                /^(container|wrapper|inner|outer)$/i, // Generic wrappers
                /^accordion-collapse$/i,               // Accordion content area
                /^tab-content$/i                       // Tab content wrapper
            ];

            const className = target.className || '';
            if (typeof className === 'string' && wrapperPatterns.some(p => p.test(className))) {
                console.log(`🚫 FlowCapture: Skipping wrapper click: .${className}`);
                return false;
            }

            // If has class name and not in reject list, allow
            if (className) {
                return true;
            }

            // Reject bare <div>, <span>, <section> without classes/id/role
            if (/^(DIV|SPAN|SECTION|ARTICLE)$/i.test(target.tagName)) {
                console.log(`🚫 FlowCapture: Skipping bare ${target.tagName} click`);
                return false;
            }

            // Allow all other cases (err on the side of recording)
            return true;
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
