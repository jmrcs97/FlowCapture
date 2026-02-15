/**
 * FlowCapture - Layout Stabilizer
 *
 * Detecta QUANDO o layout parou de mudar, não O QUE mudou.
 * CSS transitions/transforms não disparam MutationObserver —
 * getBoundingClientRect() por frame é a única medição confiável.
 *
 * Output: { frames_observed, max_layout_shift, settle_frame, stabilized, ... }
 */

import { CONFIG } from '../../shared/constants.js';

export class LayoutStabilizer {
    constructor() {
        this.candidates = new Set();
        this.prevRects = new Map(); // Element -> DOMRect do frame anterior

        this.isStabilizing = false;
        this.stableFrames = 0;
        this.frameCount = 0;
        this.maxLayoutShift = 0;
        this.settleFrame = null;

        this.startTime = 0;
        this.rafId = null;
        this.onStabilized = null;

        // Elementos novos adicionados por mutação durante estabilização
        this.newElements = [];
    }

    /**
     * Adiciona elemento pra monitorar
     */
    addCandidate(el) {
        if (!el || el.nodeType !== 1) return;
        if (this.candidates.has(el)) return;

        this.candidates.add(el);
        // Captura rect inicial pra comparar no próximo frame
        try {
            this.prevRects.set(el, el.getBoundingClientRect());
        } catch (_) { /* elemento pode estar detached */ }
    }

    addCandidates(elements) {
        elements.forEach(el => this.addCandidate(el));
    }

    /**
     * Registra elemento que apareceu via mutação (childList addedNodes)
     * Diferente de addCandidate: marca como novo pro report final
     */
    addNewElement(el, selector) {
        if (!el || el.nodeType !== 1) return;
        this.addCandidate(el);

        try {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 || rect.height > 0) {
                this.newElements.push({
                    selector,
                    rect: { width: Math.round(rect.width), height: Math.round(rect.height) }
                });
            }
        } catch (_) { /* */ }
    }

    start(onStabilized) {
        if (this.isStabilizing) return;

        this.isStabilizing = true;
        this.onStabilized = onStabilized;
        this.startTime = Date.now();
        this.stableFrames = 0;
        this.frameCount = 0;
        this.maxLayoutShift = 0;
        this.settleFrame = null;
        this.newElements = [];

        this._loop();
    }

    stop() {
        this.isStabilizing = false;
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    /**
     * Libera tudo — previne memory leak
     */
    cleanup() {
        this.stop();
        this.candidates.clear();
        this.prevRects.clear();
        this.newElements = [];
        this.onStabilized = null;
    }

    /**
     * Loop principal: calcula layout_delta agregado por frame
     *
     * Cada frame mede getBoundingClientRect() de todos os candidatos,
     * soma a diferença absoluta (top+left+width+height) de cada um,
     * e usa essa soma como frameDelta.
     *
     * Se frameDelta < LAYOUT_DELTA por MIN_STABLE_FRAMES → estabilizou.
     */
    _loop() {
        if (!this.isStabilizing) return;

        this.frameCount++;
        let frameDelta = 0;

        for (const el of this.candidates) {
            if (!document.contains(el)) {
                this.candidates.delete(el);
                this.prevRects.delete(el);
                continue;
            }

            try {
                const curr = el.getBoundingClientRect();
                const prev = this.prevRects.get(el);

                if (prev) {
                    frameDelta +=
                        Math.abs(curr.top - prev.top) +
                        Math.abs(curr.left - prev.left) +
                        Math.abs(curr.width - prev.width) +
                        Math.abs(curr.height - prev.height);
                }

                this.prevRects.set(el, curr);
            } catch (_) {
                this.candidates.delete(el);
                this.prevRects.delete(el);
            }
        }

        // Atualiza max shift
        if (frameDelta > this.maxLayoutShift) {
            this.maxLayoutShift = frameDelta;
        }

        // Contagem de frames estáveis
        if (frameDelta < CONFIG.STABILIZATION.LAYOUT_DELTA) {
            this.stableFrames++;
            if (this.settleFrame === null) {
                this.settleFrame = this.frameCount;
            }
        } else {
            this.stableFrames = 0;
            this.settleFrame = null;
        }

        const elapsed = Date.now() - this.startTime;
        const isStable = this.stableFrames >= CONFIG.STABILIZATION.MIN_STABLE_FRAMES
            && elapsed >= CONFIG.STABILIZATION.MIN_WAIT_MS;
        const isTimeout = elapsed >= CONFIG.STABILIZATION.MAX_TIMEOUT_MS;

        if (isStable || isTimeout) {
            this.stop();

            if (this.onStabilized) {
                this.onStabilized({
                    frames_observed: this.frameCount,
                    max_layout_shift: Math.round(this.maxLayoutShift * 100) / 100,
                    settle_frame: this.settleFrame,
                    stabilized: isStable,
                    timed_out: isTimeout,
                    total_ms: elapsed,
                    new_elements: this.newElements
                });
            }
        } else {
            this.rafId = requestAnimationFrame(() => this._loop());
        }
    }

    forceStabilize() {
        if (!this.isStabilizing) return null;
        this.stop();

        const report = {
            frames_observed: this.frameCount,
            max_layout_shift: Math.round(this.maxLayoutShift * 100) / 100,
            settle_frame: this.settleFrame,
            stabilized: false,
            timed_out: false,
            forced: true,
            total_ms: Date.now() - this.startTime,
            new_elements: this.newElements
        };

        if (this.onStabilized) this.onStabilized(report);
        return report;
    }
}
