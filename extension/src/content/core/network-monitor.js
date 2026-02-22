/**
 * FlowCapture - Network Monitor
 *
 * Tracks pending fetch/XHR requests to detect network idle state.
 * Used by SessionManager to enrich step data with network activity info.
 *
 * Patches window.fetch and XMLHttpRequest to count in-flight requests.
 * Restores originals on destroy().
 */

export class NetworkMonitor {
    constructor() {
        this.pendingCount = 0;
        this.totalRequests = 0;
        this._patched = false;
        this._originalFetch = null;
        this._originalXhrOpen = null;
        this._originalXhrSend = null;
        this._listeners = [];
    }

    /**
     * Start monitoring network requests.
     * Patches fetch and XHR globally.
     */
    start() {
        if (this._patched) return;
        this._patched = true;
        this.pendingCount = 0;
        this.totalRequests = 0;

        this._patchFetch();
        this._patchXhr();
    }

    /**
     * Stop monitoring and restore originals.
     */
    destroy() {
        if (!this._patched) return;
        this._patched = false;

        if (this._originalFetch) {
            window.fetch = this._originalFetch;
            this._originalFetch = null;
        }
        if (this._originalXhrOpen) {
            XMLHttpRequest.prototype.open = this._originalXhrOpen;
            this._originalXhrOpen = null;
        }
        if (this._originalXhrSend) {
            XMLHttpRequest.prototype.send = this._originalXhrSend;
            this._originalXhrSend = null;
        }

        this._listeners = [];
    }

    /**
     * @returns {boolean} True if there are pending requests
     */
    hasPending() {
        return this.pendingCount > 0;
    }

    /**
     * Get current network state snapshot
     * @returns {{ pending: number, total: number }}
     */
    getSnapshot() {
        return {
            pending: this.pendingCount,
            total: this.totalRequests,
        };
    }

    /**
     * Wait for network idle (no pending requests for quietMs).
     * @param {number} quietMs - Quiet period in ms (default: 300)
     * @param {number} timeoutMs - Max wait in ms (default: 5000)
     * @returns {Promise<{ idle: boolean, pending: number, total: number }>}
     */
    waitForIdle(quietMs = 300, timeoutMs = 5000) {
        return new Promise(resolve => {
            const start = Date.now();

            // Already idle
            if (this.pendingCount === 0) {
                setTimeout(() => {
                    if (this.pendingCount === 0) {
                        resolve({ idle: true, ...this.getSnapshot() });
                    } else {
                        poll();
                    }
                }, quietMs);
                return;
            }

            const poll = () => {
                const elapsed = Date.now() - start;
                if (elapsed >= timeoutMs) {
                    resolve({ idle: false, ...this.getSnapshot() });
                    return;
                }

                if (this.pendingCount === 0) {
                    // Wait quietMs to confirm idle
                    setTimeout(() => {
                        if (this.pendingCount === 0) {
                            resolve({ idle: true, ...this.getSnapshot() });
                        } else {
                            poll();
                        }
                    }, quietMs);
                } else {
                    setTimeout(poll, 100);
                }
            };

            poll();
        });
    }

    /** @private */
    _requestStarted() {
        this.pendingCount++;
        this.totalRequests++;
    }

    /** @private */
    _requestEnded() {
        this.pendingCount = Math.max(0, this.pendingCount - 1);
    }

    /** @private */
    _patchFetch() {
        this._originalFetch = window.fetch;
        const self = this;

        window.fetch = function (...args) {
            self._requestStarted();

            return self._originalFetch.apply(this, args)
                .then(response => {
                    self._requestEnded();
                    return response;
                })
                .catch(err => {
                    self._requestEnded();
                    throw err;
                });
        };
    }

    /** @private */
    _patchXhr() {
        this._originalXhrOpen = XMLHttpRequest.prototype.open;
        this._originalXhrSend = XMLHttpRequest.prototype.send;
        const self = this;

        XMLHttpRequest.prototype.open = function (...args) {
            // Mark this XHR instance as tracked
            this._fcTracked = true;
            return self._originalXhrOpen.apply(this, args);
        };

        XMLHttpRequest.prototype.send = function (...args) {
            if (this._fcTracked) {
                self._requestStarted();

                const onDone = () => {
                    self._requestEnded();
                    this.removeEventListener('load', onDone);
                    this.removeEventListener('error', onDone);
                    this.removeEventListener('abort', onDone);
                    this.removeEventListener('timeout', onDone);
                };

                this.addEventListener('load', onDone);
                this.addEventListener('error', onDone);
                this.addEventListener('abort', onDone);
                this.addEventListener('timeout', onDone);
            }

            return self._originalXhrSend.apply(this, args);
        };
    }
}
