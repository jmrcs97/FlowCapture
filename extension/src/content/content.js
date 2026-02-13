// Guard against double injection
if (window.hasFlowCapture) {
    if (window.overlay) window.overlay.toggle();
} else {
    window.hasFlowCapture = true;
    {
        let isRecording = false; // Global state
        let currentSession = null;
        let mutationObserver = null;
        let recordedSteps = []; // Store all recorded steps

        // Helper: Unique Selector (Simplified for readability)
        function getUniqueSelector(el) {
            if (!el || el.nodeType !== 1) return null;

            // Prefer ID if available
            if (el.id) return `#${el.id}`;

            // Try to find a unique class combination
            if (el.className && typeof el.className === 'string' && el.className.trim() !== '') {
                const classes = el.className.trim().split(/\s+/).filter(c =>
                    // Filter out common utility classes to keep selector short
                    !c.match(/^(d-|flex-|align-|justify-|m[tbrl]?-|p[tbrl]?-|w-|h-|text-|bg-|border-|gap-|show|active|visible)/)
                );
                if (classes.length > 0) {
                    // Use first meaningful class + tag
                    return `${el.tagName.toLowerCase()}.${classes[0]}`;
                }
            }

            // Fallback: tag with nth-of-type
            let selector = el.tagName.toLowerCase();
            let sibling = el.previousElementSibling;
            let index = 1;
            while (sibling) {
                if (sibling.tagName === el.tagName) index++;
                sibling = sibling.previousElementSibling;
            }
            if (index > 1 || (el.nextElementSibling && el.nextElementSibling.tagName === el.tagName)) {
                selector += `:nth-of-type(${index})`;
            }

            return selector;
        }

        // ─── DOM SNAPSHOT ENGINE ─────────────────────────────────────────────────────

        function createDOMSnapshot() {
            return {
                bodyClasses: document.body.className,
                timestamp: Date.now()
            };
        }

        // ─── VISUAL LAYOUT LAYER ──────────────────────────────────────────────────────

        class LayoutStabilizer {
            constructor() {
                this.candidates = new Set();
                this.snapshots = new Map();
                this.stableFrames = 0;
                this.rafId = null;
                this.isStabilizing = false;
                this.onStabilized = null;
                this.startTime = 0;
                this.lastChangeTime = 0;
                this.visualChanges = {};
                this.animationDetected = false;
            }

            addCandidate(el) {
                if (el && el.nodeType === 1 && !this.candidates.has(el)) {
                    this.candidates.add(el);
                    // Capture initial state immediately
                    this.snapshots.set(el, this.measure(el));
                }
            }

            measure(el) {
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
            }

            start(onStabilized) {
                if (this.isStabilizing) return;
                this.isStabilizing = true;
                this.onStabilized = onStabilized;
                this.startTime = Date.now();
                this.lastChangeTime = Date.now();
                this.stableFrames = 0;
                this.loop();
            }

            stop() {
                this.isStabilizing = false;
                if (this.rafId) cancelAnimationFrame(this.rafId);
            }

            loop() {
                if (!this.isStabilizing) return;

                let hasChange = false;
                const now = Date.now();

                this.candidates.forEach(el => {
                    // If element is detached, stop tracking it
                    if (!document.contains(el)) {
                        this.candidates.delete(el);
                        return;
                    }

                    const current = this.measure(el);
                    const prev = this.snapshots.get(el);

                    if (prev) {
                        if (this.isDifferent(prev, current)) {
                            hasChange = true;
                            this.animationDetected = true;
                            this.lastChangeTime = now;

                            // Store the delta for the report
                            const selector = getUniqueSelector(el);
                            if (selector) {
                                if (!this.visualChanges[selector]) {
                                    this.visualChanges[selector] = {
                                        before: prev,
                                        after: current, // Updating continuously until stable
                                        diffs: []
                                    };
                                }
                                this.visualChanges[selector].after = current;
                            }

                            // Update snapshot for next frame diff
                            this.snapshots.set(el, current);
                        }
                    } else {
                        // First time seeing this element in loop (e.g. just added), take snapshot
                        this.snapshots.set(el, current);
                        hasChange = true;
                    }
                });

                if (hasChange) {
                    this.stableFrames = 0;
                } else {
                    this.stableFrames++;
                }

                // Stability Criteria:
                // 1. No changes for 15 frames (~250ms)
                // 2. OR Max timeout of 3000ms reached
                // 3. AND at least 500ms has passed since start (min wait)

                const timeElapsed = now - this.startTime;
                const timeSinceLastChange = now - this.lastChangeTime;

                if ((this.stableFrames > 15 && timeElapsed > 500) || timeElapsed > 3000) {
                    this.stop();
                    if (this.onStabilized) {
                        this.onStabilized({
                            stabilized_after_ms: timeSinceLastChange, // Time relative to last movement
                            total_duration_ms: timeElapsed,
                            animation_detected: this.animationDetected,
                            visual_changes: this.visualChanges
                        });
                    }
                } else {
                    this.rafId = requestAnimationFrame(() => this.loop());
                }
            }

            isDifferent(a, b) {
                // Thresholds for noise
                if (Math.abs(a.rect.width - b.rect.width) > 1) return true;
                if (Math.abs(a.rect.height - b.rect.height) > 1) return true;
                if (Math.abs(a.rect.top - b.rect.top) > 1) return true;
                if (Math.abs(a.rect.left - b.rect.left) > 1) return true;

                if (a.opacity !== b.opacity) return true;
                if (a.transform !== b.transform) return true;
                if (a.visibility !== b.visibility) return true;
                if (a.display !== b.display) return true;

                return false;
            }
        }


        class InteractionSession {
            constructor(triggerEvent) {
                this.id = Math.random().toString(36).substr(2, 9);
                this.trigger = {
                    type: triggerEvent.type,
                    selector: getUniqueSelector(triggerEvent.target),
                    timestamp: Date.now()
                };

                if (triggerEvent.type === 'input_change') {
                    this.trigger.value = triggerEvent.value;
                } else if (triggerEvent.type === 'scroll') {
                    this.trigger.scroll = triggerEvent.scrollData;
                }

                this.beforeState = createDOMSnapshot();
                this.mutations = [];
                this.isFinalized = false;

                // Init Visual Stabilizer
                this.layoutStabilizer = new LayoutStabilizer();

                // Add trigger target to stabilizer candidate
                if (triggerEvent.target) {
                    this.layoutStabilizer.addCandidate(triggerEvent.target);
                    // Also add parent (container often changes size)
                    if (triggerEvent.target.parentElement) {
                        this.layoutStabilizer.addCandidate(triggerEvent.target.parentElement);
                    }
                }

                // Start stabilization loop immediately
                // We pass the callback for when it's done
                this.layoutStabilizer.start((visualReport) => {
                    this.finalize(visualReport);
                });
            }

            addMutation(record) {
                this.mutations.push(record);

                // Feed mutation targets to Visual Stabilizer
                if (record.type === 'childList') {
                    record.addedNodes.forEach(node => {
                        if (node.nodeType === 1) this.layoutStabilizer.addCandidate(node);
                    });
                    // We can't track removed nodes visual state easily as they are gone
                } else if (record.type === 'attributes') {
                    if (record.target.nodeType === 1) this.layoutStabilizer.addCandidate(record.target);
                }

                // Resetting the timer is likely not needed if the stabilizer is frame-based
                // But if a NEW mutation happens late, we should ensure the stabilizer sees it.
                // The stabilizer loop checks candidates every frame, so it will catch it.
                // However, if the stabilizer ALREADY finished, we might have an issue.
                // But `isFinalized` check prevents double finalization.
            }

            finalize(visualReport) {
                if (this.isFinalized) return;
                this.isFinalized = true;
                this.layoutStabilizer.stop(); // Ensure stopped

                this.afterState = createDOMSnapshot();

                const diff = this.computeDiff(visualReport);

                // Store
                recordedSteps.push(diff);

                // Update overlay counter in real-time
                if (window.overlay) {
                    window.overlay.updateCount(recordedSteps.length);
                }

                // Notify Popup
                chrome.runtime.sendMessage({
                    action: 'intentUpdated',
                    count: recordedSteps.length
                }).catch(() => { });

                console.log("Captured Intent Step (Visual Aware):", diff);

                // Only clear the global session if it's still us
                if (currentSession === this) {
                    currentSession = null;
                }
            }

            computeDiff(visualReport) {
                // 1. Body Class Changes
                const bodyClassDiff = this.diffClasses(this.beforeState.bodyClasses, this.afterState.bodyClasses);

                // 2. Analyze Mutations (Focus on meaningful changes only)
                const analysis = {
                    attribute_changes: [],
                    visual_changes: visualReport ? visualReport.visual_changes : {}
                };

                // Process visual report into cleaner format - FILTER NOISE
                const visualSummary = [];
                if (visualReport && visualReport.visual_changes) {
                    Object.keys(visualReport.visual_changes).forEach(sel => {
                        const change = visualReport.visual_changes[sel];
                        const before = change.before;
                        const after = change.after;

                        // Priority properties to track (most important first)
                        const properties = [
                            { name: 'height', threshold: 5, priority: 1 },
                            { name: 'width', threshold: 5, priority: 1 },
                            { name: 'opacity', threshold: 0.01, priority: 2 },
                            { name: 'display', threshold: 0, priority: 2 },
                            { name: 'visibility', threshold: 0, priority: 2 },
                            { name: 'transform', threshold: 0, priority: 3 }
                            // Note: top/left excluded by default (too noisy from animations)
                        ];

                        properties.forEach(({ name: p, threshold }) => {
                            let valBefore = before.rect[p] !== undefined ? before.rect[p] : before[p];
                            let valAfter = after.rect[p] !== undefined ? after.rect[p] : after[p];

                            if (p === 'width' || p === 'height') {
                                valBefore = Math.round(valBefore);
                                valAfter = Math.round(valAfter);
                            }

                            // Only track if difference is significant
                            const diff = typeof valBefore === 'number'
                                ? Math.abs(valAfter - valBefore)
                                : (valBefore !== valAfter ? 1 : 0);

                            if (diff > threshold) {
                                visualSummary.push({
                                    selector: sel,
                                    property: p,
                                    before: valBefore,
                                    after: valAfter,
                                    delta: typeof valBefore === 'number' ? valAfter - valBefore : null
                                });
                            }
                        });
                    });
                }

                // Sort by significance and keep only top changes
                visualSummary.sort((a, b) => {
                    // Priority: height/width changes > opacity > others
                    const priorityA = (a.property === 'height' || a.property === 'width') ? 3 : (a.property === 'opacity' ? 2 : 1);
                    const priorityB = (b.property === 'height' || b.property === 'width') ? 3 : (b.property === 'opacity' ? 2 : 1);

                    if (priorityA !== priorityB) return priorityB - priorityA;

                    // Within same priority, sort by magnitude of change
                    const deltaA = Math.abs(a.delta || 0);
                    const deltaB = Math.abs(b.delta || 0);
                    return deltaB - deltaA;
                });

                // Keep only the most significant changes (max 15)
                analysis.visual_summary = visualSummary.slice(0, 15);

                // Only track meaningful attribute changes (like class changes that affect visibility/state)
                const seenSelectors = new Set();
                this.mutations.forEach(m => {
                    if (m.type === 'attributes' && analysis.attribute_changes.length < 5) {
                        const target = m.target;
                        if (target.nodeType === 1) {
                            const selector = getUniqueSelector(target);
                            // Only track class changes (most meaningful for UI state)
                            if (m.attributeName === 'class') {
                                const key = `${selector}:${m.attributeName}`;
                                if (!seenSelectors.has(key)) {
                                    const newVal = target.getAttribute(m.attributeName);
                                    analysis.attribute_changes.push({
                                        selector: selector,
                                        attribute: m.attributeName,
                                        old_value: m.oldValue,
                                        new_value: newVal
                                    });
                                    seenSelectors.add(key);
                                }
                            }
                        }
                    }
                });

                // 3. Construct Semantic Step (clean format - only what matters)
                const step = {
                    step_id: this.id,
                    trigger: this.trigger,
                    visual_changes: analysis.visual_summary,
                    duration_ms: this.afterState.timestamp - this.trigger.timestamp
                };

                // Only include class changes if there are any (these show state changes like "modal-open", "active", etc)
                if (analysis.attribute_changes.length > 0) {
                    step.class_changes = analysis.attribute_changes;
                }

                // Only include body class changes if there are any
                if (bodyClassDiff) {
                    step.body_class_changes = bodyClassDiff;
                }

                return step;
            }

            // ... keep helpers ...
            diffClasses(before, after) {
                const b = new Set(before ? before.split(/\s+/).filter(c => c) : []);
                const a = new Set(after ? after.split(/\s+/).filter(c => c) : []);
                const added = [...a].filter(x => !b.has(x));
                const removed = [...b].filter(x => !a.has(x));
                if (added.length === 0 && removed.length === 0) return null;
                return { added, removed };
            }
        }

        // ─── REFACTORED RECORDING LOGIC ──────────────────────────────────────────────

        console.log('FlowCapture: Content script loaded');

        // Check recording state on load (in case of refresh)
        chrome.storage.local.get(['isRecording'], (result) => {
            console.log('FlowCapture: Initial state check', result);
            if (result.isRecording) {
                isRecording = true;
                startObserver();
            }
        });

        // Interaction Listeners
        document.addEventListener('click', (e) => {
            if (!isRecording) return;
            try {
                // If a previous session is still stabilizing (e.g. fast clicks), finalize it now.
                if (currentSession) currentSession.finalize();

                currentSession = new InteractionSession({ type: 'click', target: e.target });
                console.log('FlowCapture: Click session started', currentSession.id);
            } catch (err) {
                console.error('FlowCapture Error:', err);
            }
        }, true);

        document.addEventListener('change', (e) => {
            if (!isRecording) return;
            try {
                const t = e.target;
                if (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') {
                    if (currentSession) currentSession.finalize();

                    let val = t.value;
                    if (t.type === 'checkbox' || t.type === 'radio') val = t.checked;

                    currentSession = new InteractionSession({
                        type: 'input_change',
                        target: t,
                        value: val
                    });
                    console.log('FlowCapture: Input session started', currentSession.id);
                }
            } catch (err) {
                console.error('FlowCapture Error:', err);
            }
        }, true);

        // Scroll tracking with debounce
        let scrollTimeout = null;
        let scrollStart = null;
        document.addEventListener('scroll', (e) => {
            if (!isRecording) return;
            try {
                // Record scroll start position
                if (!scrollStart) {
                    scrollStart = {
                        x: window.scrollX,
                        y: window.scrollY,
                        target: e.target === document ? document.documentElement : e.target
                    };
                }

                // Clear previous timeout
                if (scrollTimeout) clearTimeout(scrollTimeout);

                // Wait for scroll to finish (debounce 150ms)
                scrollTimeout = setTimeout(() => {
                    if (currentSession) currentSession.finalize();

                    const scrollEnd = {
                        x: window.scrollX,
                        y: window.scrollY
                    };

                    currentSession = new InteractionSession({
                        type: 'scroll',
                        target: scrollStart.target,
                        scrollData: {
                            from: { x: scrollStart.x, y: scrollStart.y },
                            to: scrollEnd,
                            delta: {
                                x: scrollEnd.x - scrollStart.x,
                                y: scrollEnd.y - scrollStart.y
                            }
                        }
                    });
                    console.log('FlowCapture: Scroll session started', currentSession.id);
                    scrollStart = null;
                }, 150);
            } catch (err) {
                console.error('FlowCapture Error:', err);
            }
        }, true);

        // Init Mutation Observer
        function startObserver() {
            if (mutationObserver) mutationObserver.disconnect();


            mutationObserver = new MutationObserver((mutations) => {
                if (!isRecording) return;

                if (currentSession) {
                    mutations.forEach(m => currentSession.addMutation(m));
                }
            });

            mutationObserver.observe(document, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeOldValue: true,
                characterData: true,
                characterDataOldValue: true
            });
        }

        // Communication
        // Communication
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            try {
                if (request.action === 'toggleOverlay') {
                    if (window.overlay) window.overlay.toggle();
                    sendResponse({ status: 'toggled' });
                } else if (request.action === 'startRecording') {
                    isRecording = true;
                    recordedSteps = [];
                    startObserver();

                    // Show overlay in minimized state
                    if (window.overlay) {
                        window.overlay.updateUI(true, 0);
                        window.overlay.show();
                        const now = Date.now();
                        window.overlay.startTimer(now);
                    }

                    sendResponse({ status: 'started' });
                } else if (request.action === 'stopRecording') {
                    isRecording = false;
                    if (currentSession) currentSession.finalize();
                    if (mutationObserver) mutationObserver.disconnect();

                    // Update overlay to idle state
                    if (window.overlay) {
                        window.overlay.updateUI(false, recordedSteps.length);
                        window.overlay.stopTimer();
                    }

                    sendResponse({ status: 'stopped', count: recordedSteps.length });
                } else if (request.action === 'captureState') {
                    if (currentSession) currentSession.finalize();

                    // Create a checkpoint snapshot
                    const dummySession = new InteractionSession({ type: 'checkpoint', target: document.body });
                    // Note: finalize() will be called automatically by the stabilizer

                    sendResponse({ status: 'captured' });
                } else if (request.action === 'getIntent') {
                    sendResponse({
                        intent: {
                            url: window.location.href,
                            intent_analysis: {
                                summary: "Deterministic UI Mutation Log",
                                version: "2.0-diff-engine",
                                steps: recordedSteps
                            }
                        }
                    });
                }
            } catch (e) {
                console.error('FlowCapture Message Error:', e);
                sendResponse({ status: 'error', message: e.message });
            }
            return true;
        });

        // ─── OVERLAY UI ──────────────────────────────────────────────────────────────

        class OverlayUI {
            constructor() {
                this.container = document.createElement('div');
                this.container.id = 'flow-capture-overlay-root';
                this.shadow = this.container.attachShadow({ mode: 'open' });
                this.isVisible = false;

                this.render();
                document.body.appendChild(this.container);

                // Restore state if recording
                chrome.storage.local.get(['isRecording', 'startTime', 'eventCount'], (res) => {
                    if (res.isRecording) {
                        this.updateUI(true, res.eventCount || 0);
                        if (res.startTime) this.startTimer(res.startTime);
                        this.show();
                    }
                });
            }

            render() {
                // Styles
                const style = document.createElement('style');
                style.textContent = `
            :host {
                font-family: 'Inter', system-ui, sans-serif;
                z-index: 2147483647;
                position: fixed;
                bottom: 20px;
                right: 20px;
                display: none;
            }
            :host(.visible) { display: block; }

            .widget {
                background: rgba(15, 23, 42, 0.95);
                border: 1px solid rgba(59, 130, 246, 0.3);
                border-radius: 12px;
                box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.5);
                width: 300px;
                padding: 16px;
                color: white;
                transition: all 0.3s ease;
            }

            /* Minimized State */
            .widget.minimized {
                width: 48px;
                height: 48px;
                padding: 0;
                border-radius: 50%;
                overflow: hidden;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .widget.minimized .full-ui { display: none; }
            .widget.minimized .mini-ui { display: flex; }
            .widget:not(.minimized) .mini-ui { display: none; }
            
            /* Expand on Hover */
            .widget.minimized:hover {
                width: 300px;
                height: auto;
                padding: 16px;
                border-radius: 12px;
            }
            .widget.minimized:hover .full-ui { display: block; }
            .widget.minimized:hover .mini-ui { display: none; }

            .recording-dot {
                width: 12px;
                height: 12px;
                background: #ef4444;
                border-radius: 50%;
                animation: pulse 2s infinite;
            }
            @keyframes pulse {
                0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
                70% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
                100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
            }

            h2 { margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: #94a3b8; display: flex; justify-content: space-between; }
            
            button {
                width: 100%;
                padding: 8px;
                margin-top: 8px;
                border-radius: 6px;
                border: none;
                cursor: pointer;
                font-weight: 500;
            }
            .btn-primary { background: #3b82f6; color: white; }
            .btn-danger { background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); }
            .btn-secondary { background: rgba(255, 255, 255, 0.1); color: white; }
            
            .stats { display: flex; gap: 8px; margin-bottom: 8px; }
            .stat-box { flex: 1; background: rgba(0,0,0,0.3); padding: 8px; border-radius: 4px; text-align: center; }
            .stat-val { font-size: 16px; font-weight: bold; display: block; }
            .stat-label { font-size: 10px; color: #64748b; }
        `;

                this.shadow.appendChild(style);

                const wrapper = document.createElement('div');
                wrapper.className = 'widget';
                wrapper.innerHTML = `
            <div class="mini-ui">
                <div class="recording-dot"></div>
            </div>
            <div class="full-ui">
                <h2>
                    <span>FlowCapture</span>
                    <span id="close-btn" style="cursor:pointer;">×</span>
                </h2>
                
                <div id="idle-view">
                    <button class="btn-primary" id="btn-start">Start Recording</button>
                    <button class="btn-secondary" id="btn-dl-prev" style="display:none">Download Previous</button>
                </div>
                
                <div id="rec-view" style="display:none">
                    <div class="stats">
                        <div class="stat-box">
                            <span class="stat-val" id="timer">00:00</span>
                            <span class="stat-label">TIME</span>
                        </div>
                        <div class="stat-box">
                            <span class="stat-val" id="count">0</span>
                            <span class="stat-label">STEPS</span>
                        </div>
                    </div>
                    <button class="btn-secondary" id="btn-checkpoint">📸 Snapshot</button>
                    <button class="btn-danger" id="btn-stop">Stop</button>
                </div>
            </div>
        `;
                this.shadow.appendChild(wrapper);

                this.bindEvents(wrapper);
                this.widget = wrapper;
            }

            bindEvents(w) {
                w.querySelector('#close-btn').onclick = (e) => { e.stopPropagation(); this.hide(); };

                w.querySelector('#btn-start').onclick = () => {
                    isRecording = true;
                    recordedSteps = [];
                    startObserver();
                    const now = Date.now();
                    chrome.storage.local.set({ isRecording: true, startTime: now, eventCount: 0 });
                    this.updateUI(true, 0);
                    this.startTimer(now);
                };

                w.querySelector('#btn-stop').onclick = () => {
                    isRecording = false;
                    if (currentSession) currentSession.finalize();
                    if (mutationObserver) mutationObserver.disconnect();
                    chrome.storage.local.set({ isRecording: false, eventCount: recordedSteps.length });
                    this.stopTimer();
                    this.updateUI(false, recordedSteps.length);

                    // Show download button
                    const dlBtn = w.querySelector('#btn-dl-prev');
                    dlBtn.style.display = 'block';
                    dlBtn.textContent = `Download (${recordedSteps.length})`;
                    dlBtn.onclick = () => this.download();
                };

                w.querySelector('#btn-checkpoint').onclick = () => {
                    if (currentSession) currentSession.finalize();
                    const dummy = new InteractionSession({ type: 'checkpoint', target: document.body });
                    dummy.finalize();
                    this.updateCount(recordedSteps.length);
                };

                // Auto-Minimize on click outside
                document.addEventListener('click', (e) => {
                    // If sticky minimize mode is requested...
                    // For now, let's just use the hover behavior for expansion.
                    // Default to minimized if recording? 
                    if (this.isRecording) {
                        this.widget.classList.add('minimized');
                    }
                });

                // Hover to expand
                w.addEventListener('mouseenter', () => this.widget.classList.remove('minimized'));
                w.addEventListener('mouseleave', () => {
                    if (this.isRecording) this.widget.classList.add('minimized');
                });
            }

            updateUI(isRec, count) {
                this.isRecording = isRec;
                const idle = this.shadow.querySelector('#idle-view');
                const rec = this.shadow.querySelector('#rec-view');
                if (isRec) {
                    idle.style.display = 'none';
                    rec.style.display = 'block';
                    this.widget.classList.add('minimized'); // Auto minimize on start
                } else {
                    idle.style.display = 'block';
                    rec.style.display = 'none';
                    this.widget.classList.remove('minimized');
                }
                this.updateCount(count);
            }

            updateCount(n) {
                const el = this.shadow.querySelector('#count');
                if (el) el.textContent = n;
            }

            startTimer(startTimestamp) {
                if (this.timerInterval) clearInterval(this.timerInterval);
                this.timerInterval = setInterval(() => {
                    const secs = Math.floor((Date.now() - startTimestamp) / 1000);
                    const m = Math.floor(secs / 60).toString().padStart(2, '0');
                    const s = (secs % 60).toString().padStart(2, '0');
                    const el = this.shadow.querySelector('#timer');
                    if (el) el.textContent = `${m}:${s}`;
                }, 1000);
            }

            stopTimer() {
                if (this.timerInterval) clearInterval(this.timerInterval);
            }

            download() {
                const intent = {
                    url: window.location.href,
                    intent_analysis: {
                        summary: "Deterministic UI Mutation Log",
                        version: "2.0-diff-engine",
                        steps: recordedSteps
                    }
                };
                const blob = new Blob([JSON.stringify(intent, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'flow_capture.json';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }

            show() { this.container.classList.add('visible'); }
            hide() { this.container.classList.remove('visible'); }
            toggle() { this.container.classList.toggle('visible'); }
        }

        // Init Global
        window.overlay = new OverlayUI();
    }
}
