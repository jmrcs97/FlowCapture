/**
 * FlowCapture - Selector Engine v2
 * Robust CSS selector generation with multiple fallback strategies
 *
 * Strategy order:
 * 1. ID
 * 2. XPath with predicates (tag + aria-label/text/name/title/role — combines when needed)
 * 3. Aria label → aria/Label (Puppeteer-native, simple fallback)
 * 4. Stable data-* attributes (CSS)
 * 5. Meaningful classes (filters styled-component hashes)
 * 6. Path selector (parent > child chain)
 * 7. nth-of-type (last resort)
 * 8. Text content text:: (fallback)
 * 9. Image alt text (fallback)
 * 10. Closest heading context (fallback)
 *
 * Also generates fallback candidates for robustness.
 */

import { CONFIG } from '../../shared/constants.js';
import { INTERACTIVE_ELEMENTS } from '../../shared/interactive-elements.js';

export class SelectorEngine {
    constructor() {
        this.cache = new WeakMap();
        this.utilityPattern = CONFIG.SELECTOR.UTILITY_CLASS_PATTERN;

        // Pattern for styled-component / CSS-in-JS hash classes
        // Matches: sc-*, __*-sc-*, random 4-8 char lowercase hashes like eKWknK, gYfNos
        this._scHashPattern = /^[a-zA-Z]{4,8}$/;
        this._scPrefixPattern = /(-sc-|__.*-sc-|^sc-|^css-|^styled-|^emotion-)/;

        // Dynamic state classes that change at runtime (break selectors on replay)
        this._stateClassPattern = /^(active|selected|focused|focus|hover|open|opened|closed|collapsed|expanded|disabled|hidden|visible|show|hide|checked|current|is-active|is-open|is-selected|is-visible|is-hidden|is-disabled|is-expanded|is-collapsed|toggled|highlighted|pressed|dragging|loading|loaded|entering|leaving|entered|exited)$/;
    }

    /**
     * Check if an ID is truly unique on the page.
     * Many sites reuse IDs (e.g., two tab containers with same ID).
     * @param {string} id
     * @returns {boolean}
     * @private
     */
    _isIdUnique(id) {
        try {
            return document.querySelectorAll(`#${CSS.escape(id)}`).length === 1;
        } catch {
            return false;
        }
    }

    /**
     * Get best unique selector for element (with caching)
     * @param {Element} el
     * @returns {string|null}
     */
    getUniqueSelector(el) {
        if (!el || el.nodeType !== 1) return null;

        if (this.cache.has(el)) {
            return this.cache.get(el);
        }

        const selector = this._computeSelector(el);

        if (selector) {
            this.cache.set(el, selector);
        }

        return selector;
    }

    /**
     * Get multiple selector candidates for fallback
     * Stores best + fallbacks for robust playback
     * @param {Element} el
     * @returns {{ primary: string, fallbacks: string[] }}
     */
    getMultipleCandidates(el) {
        if (!el || el.nodeType !== 1) return { primary: null, fallbacks: [] };

        // Skip overlay elements entirely
        if (el.id === 'flow-capture-overlay-root' || el.closest?.('#flow-capture-overlay-root')) {
            return { primary: null, fallbacks: [] };
        }

        // Bubble up to nearest interactive ancestor (e.g. <div> inside <button> → <button>)
        // This prevents fragile path selectors when clicking presentational wrappers
        const resolvedEl = INTERACTIVE_ELEMENTS.findInteractiveAncestor(el);
        if (resolvedEl !== el) {
            console.debug(`[SelectorEngine] Bubbled from <${el.tagName.toLowerCase()}> to <${resolvedEl.tagName.toLowerCase()}>`);
            el = resolvedEl;
        }

        const candidates = [];

        // Each strategy is wrapped in try/catch for robustness
        const tryAdd = (fn, strategy) => {
            try {
                const sel = fn();
                if (sel) candidates.push({ selector: sel, strategy });
            } catch (e) {
                console.warn(`SelectorEngine: Strategy "${strategy}" failed:`, e.message);
            }
        };

        // Puppeteer-safe selectors first (priority order)
        if (el.id && !this._isBogusValue(el.id) && this._isIdUnique(el.id)) {
            candidates.push({ selector: `#${CSS.escape(el.id)}`, strategy: 'id' });
        }

        tryAdd(() => this._getXPathSelector(el), 'xpath');
        tryAdd(() => this._getAriaSelector(el), 'aria');
        tryAdd(() => this._getAttributeSelector(el), 'attribute');
        tryAdd(() => this._getClassSelector(el), 'class');
        tryAdd(() => this._getPathSelector(el, 4), 'path');
        tryAdd(() => this._getNthWithContext(el), 'nth-of-type');

        // Text-based selectors as fallbacks only
        tryAdd(() => this._getTextBasedSelector(el), 'text');
        tryAdd(() => this._getImgAltSelector(el), 'img-alt');
        tryAdd(() => this._getClosestHeadingSelector(el), 'heading-context');

        if (candidates.length === 0) return { primary: null, fallbacks: [] };

        return {
            primary: candidates[0].selector,
            fallbacks: candidates.slice(1).map(c => c.selector),
            strategies: candidates.map(c => c.strategy)
        };
    }

    /**
     * Compute best selector - tries strategies in order until one is unique
     * @param {Element} el
     * @returns {string|null}
     * @private
     */
    _computeSelector(el) {
        // Bubble up to nearest interactive ancestor before applying strategies
        el = INTERACTIVE_ELEMENTS.findInteractiveAncestor(el);

        // Strategy 1: ID (only if truly unique on page)
        if (el.id && !this._isBogusValue(el.id) && this._isIdUnique(el.id)) {
            return `#${CSS.escape(el.id)}`;
        }

        // Strategy 2: XPath with predicates (combines conditions for uniqueness)
        const xpathSelector = this._getXPathSelector(el);
        if (xpathSelector) {
            return xpathSelector;
        }

        // Strategy 3: Aria label (Puppeteer-native aria/ selector)
        const ariaSelector = this._getAriaSelector(el);
        if (ariaSelector) {
            return ariaSelector;
        }

        // Strategy 4: Stable data-* attributes (CSS)
        const attrSelector = this._getAttributeSelector(el);
        if (attrSelector && this._isUniqueSafe(attrSelector)) {
            return attrSelector;
        }

        // Strategy 5: Meaningful classes (filters SC hashes)
        const classSelector = this._getClassSelector(el);
        if (classSelector && this._isUniqueSafe(classSelector)) {
            return classSelector;
        }

        // Strategy 6: Path selector (parent > child chain)
        const pathSelector = this._getPathSelector(el, 4);
        if (pathSelector && this._isUniqueSafe(pathSelector)) {
            return pathSelector;
        }

        // Strategy 7: nth-of-type with parent context (last resort CSS)
        const nthSelector = this._getNthWithContext(el);
        if (nthSelector) {
            return nthSelector;
        }

        // Strategy 8-10: Fallbacks (text::, img-alt, heading-context)
        const textSelector = this._getTextBasedSelector(el);
        if (textSelector) return textSelector;

        const imgSelector = this._getImgAltSelector(el);
        if (imgSelector && this._isUniqueSafe(imgSelector)) return imgSelector;

        const headingSelector = this._getClosestHeadingSelector(el);
        if (headingSelector && this._isUniqueSafe(headingSelector)) return headingSelector;

        return nthSelector || el.tagName.toLowerCase();
    }

    // ─── Strategy Implementations ────────────────────────

    /**
     * Strategy 2: XPath with predicates
     * Generates //tag[@attr="val"] format with automatic predicate combining
     * When a single predicate isn't unique, combines 2 predicates for precision
     * Backend smartSelector parses XPath natively (starts with //)
     * @private
     */
    _getXPathSelector(el) {
        const tag = el.tagName.toLowerCase();
        const predicates = this._collectXPathPredicates(el);

        if (predicates.length === 0) return null;

        // 1. Try single predicate (simplest, most readable)
        for (const pred of predicates) {
            const xpath = `//${tag}${pred.expr}`;
            if (this._isXPathUnique(xpath)) return xpath;
        }

        // 2. Combine 2 predicates for uniqueness (conditional identification)
        for (let i = 0; i < predicates.length; i++) {
            for (let j = i + 1; j < predicates.length; j++) {
                const xpath = `//${tag}${predicates[i].expr}${predicates[j].expr}`;
                if (this._isXPathUnique(xpath)) return xpath;
            }
        }

        // 3. Try with ancestor context (scoped XPath)
        if (predicates.length > 0) {
            const scoped = this._getScopedXPath(el, tag, predicates);
            if (scoped) return scoped;
        }

        return null;
    }

    /**
     * Collect XPath predicates from element attributes and text
     * @private
     */
    _collectXPathPredicates(el) {
        const preds = [];

        // NOTE: aria-expanded / aria-selected / aria-checked etc. are intentionally NOT
        // added as predicates here — they are runtime state attributes that change at
        // runtime (e.g. accordion open/close) and would break replay selectors.

        const ariaLabel = el.getAttribute('aria-label');
        if (ariaLabel?.trim() && !this._isBogusValue(ariaLabel)) {
            preds.push({ expr: `[@aria-label=${this._xq(ariaLabel.trim())}]`, weight: 1 });
        }

        // Direct text content
        const text = this._getDirectText(el);
        const isSemantic = /^(H[1-6]|BUTTON|A|LABEL|LI|SUMMARY|FIGCAPTION|LEGEND|OPTION|TD|TH)$/.test(el.tagName);
        if (text && text.length >= 2 && text.length <= 60 && !/^\d+$/.test(text) && !/^\s*$/.test(text)) {
            if (isSemantic || text.length <= 25) {
                // Semantic elements or short text: exact match is reliable
                preds.push({ expr: `[normalize-space(.)=${this._xq(text)}]`, weight: 1 });
            } else {
                // Content elements (p, div, span) with long text: use contains() for resilience
                const words = text.split(/\s+/);
                const snippet = words.length > 3 ? words.slice(0, 3).join(' ') : text;
                preds.push({ expr: `[contains(normalize-space(.),${this._xq(snippet)})]`, weight: 2 });
            }
        } else if (isSemantic) {
            // Semantic elements: use full innerText when direct text is empty (e.g., <button><div>Text</div></button>)
            const inner = (el.innerText || el.textContent || '').trim();
            if (inner && inner.length >= 2 && !/^\d+$/.test(inner) && !/^\s*$/.test(inner)) {
                if (inner.length <= 80) {
                    preds.push({ expr: `[normalize-space(.)=${this._xq(inner)}]`, weight: 1 });
                } else {
                    // Long text: use contains() with first 50 chars
                    const snippet = inner.substring(0, 50).trim();
                    preds.push({ expr: `[contains(normalize-space(.),${this._xq(snippet)})]`, weight: 2 });
                }
            }
        }

        const name = el.getAttribute('name');
        if (name && !this._isBogusValue(name)) {
            preds.push({ expr: `[@name=${this._xq(name)}]`, weight: 2 });
        }

        const title = el.getAttribute('title');
        if (title?.trim() && !this._isBogusValue(title)) {
            preds.push({ expr: `[@title=${this._xq(title.trim())}]`, weight: 2 });
        }

        const placeholder = el.getAttribute('placeholder');
        if (placeholder && !this._isBogusValue(placeholder)) {
            preds.push({ expr: `[@placeholder=${this._xq(placeholder)}]`, weight: 2 });
        }

        const role = el.getAttribute('role');
        if (role && !this._isBogusValue(role)) {
            preds.push({ expr: `[@role=${this._xq(role)}]`, weight: 3 });
        }

        const type = el.getAttribute('type');
        if (type && !this._isBogusValue(type)) {
            preds.push({ expr: `[@type=${this._xq(type)}]`, weight: 3 });
        }

        // Sort by weight (prefer aria-label and text first)
        preds.sort((a, b) => a.weight - b.weight);
        return preds;
    }

    /**
     * Try scoped XPath: //ancestor//tag[predicate]
     * Uses ancestor with ID or meaningful class for context
     * @private
     */
    _getScopedXPath(el, tag, predicates) {
        let ancestor = el.parentElement;
        let depth = 0;

        while (ancestor && ancestor !== document.body && depth < 4) {
            let ancestorExpr = null;

            if (ancestor.id && !this._isBogusValue(ancestor.id) && this._isIdUnique(ancestor.id)) {
                ancestorExpr = `//*[@id=${this._xq(ancestor.id)}]`;
            } else {
                const bestClass = this._getBestClass(ancestor);
                if (bestClass) {
                    const aTag = ancestor.tagName.toLowerCase();
                    ancestorExpr = `//${aTag}[contains(@class, ${this._xq(bestClass)})]`;
                }
            }

            if (ancestorExpr) {
                for (const pred of predicates) {
                    const xpath = `${ancestorExpr}//${tag}${pred.expr}`;
                    if (this._isXPathUnique(xpath)) return xpath;
                }
            }

            ancestor = ancestor.parentElement;
            depth++;
        }

        return null;
    }

    /**
     * XPath string quoting (handles strings with quotes)
     * @private
     */
    _xq(str) {
        if (!str.includes("'")) return `'${str}'`;
        if (!str.includes('"')) return `"${str}"`;
        // Contains both quote types: use concat()
        const parts = str.split("'");
        return `concat(${parts.map((p, i) => i < parts.length - 1 ? `'${p}', "'"` : `'${p}'`).join(', ')})`;
    }

    /**
     * Check if XPath selects exactly one element
     * @private
     */
    _isXPathUnique(xpath) {
        try {
            const result = document.evaluate(
                xpath, document, null,
                XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null
            );
            return result.snapshotLength === 1;
        } catch {
            return false;
        }
    }

    /**
     * Strategy 3: Aria label (Puppeteer-native aria/ selector)
     * Generates aria/Label format supported by backend smartSelector
     * @private
     */
    _getAriaSelector(el) {
        const ariaLabel = el.getAttribute('aria-label');
        if (!ariaLabel || !ariaLabel.trim() || this._isBogusValue(ariaLabel)) return null;

        const trimmed = ariaLabel.trim();
        if (trimmed.length < 2 || trimmed.length > 80) return null;

        // Validate uniqueness using CSS attribute selector
        const cssCheck = `[aria-label="${trimmed.replace(/"/g, '\\"')}"]`;
        if (this._isUniqueSafe(cssCheck)) {
            return `aria/${trimmed}`;
        }

        return null;
    }

    /**
     * Strategy 3: Stable attributes
     * @private
     */
    _getAttributeSelector(el) {
        const stableAttrs = [
            'data-testid',
            'data-test-id',
            'data-automation-id',
            'data-automation',
            'data-cy',
            'data-test',
            'data-id',
            'data-component-name',
            'name',
            'title',
            'for',
            'href'
        ];

        const tag = el.tagName.toLowerCase();

        for (const attr of stableAttrs) {
            const val = el.getAttribute(attr);
            if (!val || !val.trim() || this._isBogusValue(val)) continue;

            // For href, only use path part (skip full URLs)
            if (attr === 'href') {
                try {
                    const url = new URL(val, window.location.origin);
                    const path = url.pathname + url.hash;
                    if (path && path !== '/') {
                        const selector = `${tag}[href*="${CSS.escape(path.substring(0, 60))}"]`;
                        if (this._isUniqueSafe(selector)) return selector;
                    }
                } catch { /* skip invalid URLs */ }
                continue;
            }

            const escapedVal = val.replace(/"/g, '\\"').substring(0, 80);
            const selector = `${tag}[${attr}="${escapedVal}"]`;

            if (attr.startsWith('data-') || this._isUniqueSafe(selector)) {
                return selector;
            }
        }

        // Also check role + another attribute for combined uniqueness
        const role = el.getAttribute('role');
        if (role && !this._isBogusValue(role)) {
            const roleSelector = `${tag}[role="${role}"]`;
            if (this._isUniqueSafe(roleSelector)) return roleSelector;
        }

        return null;
    }

    /**
     * Strategy 3: Text content selector (expanded tags)
     * @private
     */
    _getTextBasedSelector(el) {
        const tag = el.tagName.toLowerCase();

        // Tags that commonly have meaningful, stable text
        const textTags = [
            'BUTTON', 'A', 'LABEL', 'SPAN',
            'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
            'LI', 'TH', 'TD', 'P', 'SUMMARY',
            'LEGEND', 'CAPTION', 'DT', 'DD',
            'OPTION', 'FIGCAPTION'
        ];

        if (!textTags.includes(el.tagName)) return null;

        // Get direct text content (not deeply nested children text)
        let text = this._getDirectText(el);

        // For headings, also try full innerText (usually short)
        if (!text && /^H[1-6]$/.test(el.tagName)) {
            text = (el.innerText || el.textContent || '').trim();
        }

        // Text must be meaningful
        if (!text || text.length < 2 || text.length > 60) return null;
        if (/^\s*$/.test(text) || /^\d+$/.test(text)) return null;

        const escaped = text.replace(/"/g, '\\"').replace(/\n/g, ' ').substring(0, 40);

        // For short, unique headings - use text:: notation
        if (/^H[1-6]$/.test(el.tagName)) {
            // Headings with unique text are great selectors
            const headingSelector = `text::"${escaped}"`;
            // Verify: only one element with this text on the page
            if (this._isTextUnique(text, el.tagName)) {
                return headingSelector;
            }
        }

        // For buttons/links with unique text
        if (['BUTTON', 'A'].includes(el.tagName)) {
            if (this._isTextUnique(text, el.tagName)) {
                return `text::"${escaped}"`;
            }
        }

        // For other tags, try tag + text contains
        if (this._isTextUnique(text, el.tagName)) {
            return `text::"${escaped}"`;
        }

        return null;
    }

    /**
     * Strategy 4: Image alt text selector
     * @private
     */
    _getImgAltSelector(el) {
        if (el.tagName !== 'IMG') return null;

        const alt = el.getAttribute('alt');
        if (!alt || alt.trim().length < 3 || this._isBogusValue(alt)) return null;

        const escaped = alt.replace(/"/g, '\\"').substring(0, 60);
        const selector = `img[alt="${escaped}"]`;

        if (this._isUniqueSafe(selector)) {
            return selector;
        }

        // Try with parent context if not unique
        const parent = el.closest('[class]');
        if (parent) {
            const parentClass = this._getBestClass(parent);
            if (parentClass) {
                const ctxSelector = `.${parentClass} img[alt="${escaped}"]`;
                if (this._isUniqueSafe(ctxSelector)) return ctxSelector;
            }
        }

        return null;
    }

    /**
     * Strategy 5: Find nearest heading to build contextual selector
     * E.g., clicking a button inside a card → find the card's h3 text
     * @private
     */
    _getClosestHeadingSelector(el) {
        const tag = el.tagName.toLowerCase();

        // Walk up to find a container with a heading
        let container = el.parentElement;
        let depth = 0;

        while (container && depth < 6) {
            // Look for headings inside this container
            const heading = container.querySelector('h1, h2, h3, h4, h5, h6');
            if (heading) {
                const headingText = (heading.innerText || heading.textContent || '').trim();
                if (headingText.length >= 3 && headingText.length <= 80) {
                    const escaped = headingText.replace(/"/g, '\\"').replace(/\n/g, ' ').substring(0, 40);

                    // Build: find heading text, then find our element relative to it
                    // "the <tag> near heading 'Setting up Treatment'"
                    // Use :has() or sibling strategy

                    // Strategy A: If heading is unique, use its text + relative tag
                    if (this._isTextUnique(headingText, heading.tagName)) {
                        // Find the common container that has both the heading and our element
                        const containerClass = this._getBestClass(container);

                        if (containerClass) {
                            // ".card-class h3" is unique → ".card-class tag" or ".card-class img.class"
                            const headingSel = `.${containerClass}:has(h${heading.tagName[1]}:is(text::"${escaped}"))`;

                            // Simpler: use the container class to scope
                            const elClass = this._getBestClass(el);
                            if (elClass) {
                                const candidate = `.${containerClass} .${elClass}`;
                                if (this._isUniqueSafe(candidate)) return candidate;
                            }

                            // Or use tag + alt for images
                            if (el.tagName === 'IMG') {
                                const alt = el.getAttribute('alt');
                                if (alt && !this._isBogusValue(alt)) {
                                    const candidate = `.${containerClass} img[alt="${alt.replace(/"/g, '\\"')}"]`;
                                    if (this._isUniqueSafe(candidate)) return candidate;
                                }
                            }

                            // Container class alone might be unique
                            const containerSel = `.${containerClass}`;
                            if (this._isUniqueSafe(containerSel)) return containerSel;
                        }
                    }

                    break; // Only try closest heading
                }
            }

            container = container.parentElement;
            depth++;
        }

        return null;
    }

    /**
     * Strategy 6: Meaningful class selector (filters SC hashes)
     * @private
     */
    _getClassSelector(el) {
        if (!el.className || typeof el.className !== 'string' || !el.className.trim()) return null;

        const meaningful = this._getMeaningfulClasses(el.className);
        if (meaningful.length === 0) return null;

        const tag = el.tagName.toLowerCase();

        // Try combinations of 1-3 classes
        for (let count = Math.min(3, meaningful.length); count >= 1; count--) {
            const classes = meaningful.slice(0, count).join('.');
            const selector = `${tag}.${classes}`;

            if (this._isUniqueSafe(selector)) {
                return selector;
            }
        }

        // Try without tag
        if (meaningful.length >= 2) {
            const classes = meaningful.slice(0, 2).join('.');
            const selector = `.${classes}`;
            if (this._isUniqueSafe(selector)) return selector;
        }

        return null;
    }

    /**
     * Strategy 7: Path selector (parent > child chain)
     * Builds a short ancestor chain for specificity
     * @param {Element} el
     * @param {number} maxDepth
     * @returns {string|null}
     * @private
     */
    _getPathSelector(el, maxDepth = 4) {
        const parts = [];
        let current = el;
        let depth = 0;

        while (current && current.nodeType === 1 && current !== document.body && depth < maxDepth) {
            let part = null;

            // Use ID if available and truly unique on page
            if (current.id && !this._isBogusValue(current.id) && this._isIdUnique(current.id)) {
                parts.unshift(`#${CSS.escape(current.id)}`);
                break; // ID is unique anchor
            }

            // Use best class
            const bestClass = this._getBestClass(current);
            if (bestClass) {
                part = `${current.tagName.toLowerCase()}.${bestClass}`;
            } else {
                part = current.tagName.toLowerCase();
            }

            // Disambiguate among siblings of same type
            if (current.parentElement) {
                const tag = current.tagName.toLowerCase();
                const sameTagSiblings = current.parentElement.querySelectorAll(`:scope > ${tag}`);
                if (sameTagSiblings.length > 1) {
                    // Prefer class-based disambiguation over positional nth-of-type
                    // (nth-of-type breaks in carousels/sliders that reorder children)
                    let disambiguated = false;
                    if (bestClass) {
                        const classSelector = `:scope > ${tag}.${bestClass}`;
                        try {
                            if (current.parentElement.querySelectorAll(classSelector).length === 1) {
                                disambiguated = true; // class already unique among siblings
                            }
                        } catch { /* invalid selector */ }
                    }
                    if (!disambiguated) {
                        const index = Array.from(sameTagSiblings).indexOf(current) + 1;
                        part += `:nth-of-type(${index})`;
                    }
                }
            }

            parts.unshift(part);
            current = current.parentElement;
            depth++;
        }

        if (parts.length < 2) return null;

        const selector = parts.join(' > ');

        // Validate the path selector length
        if (selector.length > CONFIG.SELECTOR.MAX_SELECTOR_LENGTH * 2) return null;

        return selector;
    }

    /**
     * Strategy 8: nth-of-type with parent context (last resort)
     * Better than bare nth-of-type: includes parent class for scoping
     * @private
     */
    _getNthWithContext(el) {
        const tag = el.tagName.toLowerCase();
        let index = 1;
        let sibling = el.previousElementSibling;

        while (sibling) {
            if (sibling.tagName === el.tagName) index++;
            sibling = sibling.previousElementSibling;
        }

        // Try to add parent context (validate uniqueness — duplicate parent classes exist)
        const parent = el.parentElement;
        if (parent && parent !== document.body) {
            // Try parent ID first (if unique)
            if (parent.id && !this._isBogusValue(parent.id) && this._isIdUnique(parent.id)) {
                const sel = `#${CSS.escape(parent.id)} > ${tag}:nth-of-type(${index})`;
                if (this._isUniqueSafe(sel)) return sel;
            }

            const parentClass = this._getBestClass(parent);
            if (parentClass) {
                const sel = `.${parentClass} > ${tag}:nth-of-type(${index})`;
                if (this._isUniqueSafe(sel)) return sel;
            }

            // Try grandparent
            const grandparent = parent.parentElement;
            if (grandparent) {
                if (grandparent.id && !this._isBogusValue(grandparent.id) && this._isIdUnique(grandparent.id)) {
                    const parentTag = parent.tagName.toLowerCase();
                    const sel = `#${CSS.escape(grandparent.id)} > ${parentTag} > ${tag}:nth-of-type(${index})`;
                    if (this._isUniqueSafe(sel)) return sel;
                }

                const gpClass = this._getBestClass(grandparent);
                if (gpClass) {
                    const parentTag = parent.tagName.toLowerCase();
                    const sel = `.${gpClass} > ${parentTag} > ${tag}:nth-of-type(${index})`;
                    if (this._isUniqueSafe(sel)) return sel;
                }
            }
        }

        // Bare nth-of-type as absolute last resort
        const needsNth = index > 1 || (el.nextElementSibling && el.nextElementSibling.tagName === el.tagName);
        return needsNth ? `${tag}:nth-of-type(${index})` : tag;
    }

    // ─── Helper Methods ──────────────────────────────────

    /**
     * Get direct text content (not from deep children)
     * @private
     */
    _getDirectText(el) {
        let text = '';
        for (const node of el.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
                text += node.textContent;
            }
        }
        return text.trim();
    }

    /**
     * Check if text is unique among same-tag elements
     * @private
     */
    _isTextUnique(text, tagName) {
        const normalizedText = text.trim().toLowerCase();
        try {
            const allSameTag = document.querySelectorAll(tagName.toLowerCase());
            let count = 0;
            for (const el of allSameTag) {
                const elText = (el.innerText || el.textContent || '').trim().toLowerCase();
                if (elText === normalizedText) {
                    count++;
                    if (count > 1) return false;
                }
            }
            return count === 1;
        } catch {
            return false;
        }
    }

    /**
     * Filter meaningful classes, excluding:
     * - Dynamic state classes (active, open, selected, etc.)
     * - Bootstrap utility classes
     * - Styled-component hash classes (eKWknK, gYfNos)
     * - CSS-in-JS prefixed classes (sc-*, css-*, emotion-*)
     * @private
     */
    _getMeaningfulClasses(className) {
        return className
            .trim()
            .split(/\s+/)
            .filter(c => {
                if (!c) return false;

                // Filter dynamic/state classes (change at runtime, break selectors)
                if (this._stateClassPattern.test(c)) return false;

                // Filter Bootstrap/utility classes
                if (this.utilityPattern.test(c)) return false;

                // Filter styled-component prefixed classes
                if (this._scPrefixPattern.test(c)) return false;

                // Filter random hash classes (4-8 chars, mixed case, no hyphens/underscores)
                // These are typically styled-component generated: eKWknK, gYfNos, MdiYe, etc.
                if (this._scHashPattern.test(c) && /[A-Z]/.test(c) && /[a-z]/.test(c)) return false;

                // Filter classes that look like generated hashes with numbers
                if (/^[a-zA-Z0-9]{6,}$/.test(c) && !/^[a-z]+(-[a-z]+)*$/.test(c)) return false;

                return true;
            });
    }

    /**
     * Get the single best class from an element (for parent context)
     * Prefers semantic classes over generated ones
     * @private
     */
    _getBestClass(el) {
        if (!el.className || typeof el.className !== 'string') return null;

        const meaningful = this._getMeaningfulClasses(el.className);
        if (meaningful.length === 0) return null;

        // Prefer classes with hyphens (BEM-like: card-body, tile-container)
        const semantic = meaningful.find(c => c.includes('-') && c.length > 4);
        return semantic || meaningful[0];
    }

    /**
     * Check if a value is bogus/invalid (e.g., "[object Object]", empty, etc.)
     * @private
     */
    _isBogusValue(val) {
        if (!val || typeof val !== 'string') return true;
        const trimmed = val.trim();
        if (!trimmed) return true;

        // Common bogus patterns
        if (trimmed === '[object Object]') return true;
        if (trimmed === 'undefined') return true;
        if (trimmed === 'null') return true;
        if (trimmed === 'true' || trimmed === 'false') return true;
        if (/^\d+$/.test(trimmed) && trimmed.length < 3) return true; // "0", "1", etc.

        return false;
    }

    /**
     * Safe isUnique check that catches invalid selectors
     * @private
     */
    _isUniqueSafe(selector) {
        if (!selector) return false;
        // Skip non-CSS notations (handled by backend smartSelector)
        if (selector.startsWith('//') || selector.startsWith('(//')) return true;
        if (selector.startsWith('text::')) return true;
        if (selector.startsWith('aria/')) return true;
        try {
            const matches = document.querySelectorAll(selector);
            return matches.length === 1;
        } catch {
            return false;
        }
    }

    // ─── Public API (kept for backwards compat) ──────────

    /**
     * @deprecated Use _isUniqueSafe instead
     */
    isUnique(selector) {
        return this._isUniqueSafe(selector);
    }

    /**
     * Path selector (public API)
     */
    getPathSelector(el, maxDepth = 3) {
        return this._getPathSelector(el, maxDepth);
    }

    /**
     * Get guaranteed unique selector
     */
    getUniqueGuaranteed(el) {
        const simple = this.getUniqueSelector(el);
        if (this._isUniqueSafe(simple)) return simple;
        return this._getPathSelector(el, 5) || simple;
    }

    clearCache() {
        this.cache = new WeakMap();
    }

    getCacheStats() {
        return {
            cacheType: 'WeakMap',
            note: 'Auto GC. Filters SC hashes + utility classes.',
            utilityPattern: this.utilityPattern.toString()
        };
    }

    batchGetSelectors(elements) {
        const results = new Map();
        elements.forEach(el => {
            const selector = this.getUniqueSelector(el);
            if (selector) results.set(el, selector);
        });
        return results;
    }

    static getElement(selector) {
        try {
            return document.querySelector(selector);
        } catch {
            return null;
        }
    }

    static matches(el, selector) {
        try {
            return el && el.matches && el.matches(selector);
        } catch {
            return false;
        }
    }
}
