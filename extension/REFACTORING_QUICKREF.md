# FlowCapture Refactoring - Quick Reference

**Last Updated:** 2026-02-20
**Status:** Phase 1 Complete ✅

---

## TL;DR

- **content.js:** 892 → 618 lines (-30.7%)
- **selector-engine.js:** 970 → 934 lines (-3.7%)
- **Total:** -310 lines (-16.6%)
- **Breaking Changes:** 0
- **Services Integrated:** 4

---

## What Changed

### content.js

#### Removed Inline Code → Use Services

| Old (Inline) | New (Service) | Lines Saved |
|-------------|---------------|-------------|
| Shortcut matching logic | `ShortcutMatcher` | 35 |
| Visual feedback methods | `VisualFeedback` | 70 |
| Expansion logic | `ExpansionManager` | 169 |

### selector-engine.js

#### Removed Duplicate Code → Use Shared Module

| Old (Duplicate) | New (Shared) | Lines Saved |
|-----------------|--------------|-------------|
| Interactive element detection | `INTERACTIVE_ELEMENTS` | 36 |

---

## Quick API Reference

### ShortcutMatcher

```javascript
import { ShortcutMatcher } from './services/shortcut-matcher.js';

// Check if event matches capture shortcut
if (ShortcutMatcher.isCapture(event, captureShortcut)) { }

// Check if event matches expand shortcut
if (ShortcutMatcher.isExpand(event, expandShortcut)) { }

// Check if event is height adjustment (Ctrl+Shift+Up/Down)
if (ShortcutMatcher.isHeightAdjustment(event)) { }

// Get height adjustment delta
const delta = ShortcutMatcher.getHeightDelta(event, step);
```

### VisualFeedback

```javascript
import { VisualFeedback } from './ui/visual-feedback.js';

const visualFeedback = new VisualFeedback();
visualFeedback.initializeAnimations(); // Call once

// Show floating action icon
visualFeedback.showActionIcon('capture');    // 📸
visualFeedback.showActionIcon('expand');     // 📐
visualFeedback.showActionIcon('adjust-up');  // ⬆️
visualFeedback.showActionIcon('adjust-down'); // ⬇️

// Show element outline
visualFeedback.showElementOutline(element, 'success'); // green
visualFeedback.showElementOutline(element, 'error');   // red
visualFeedback.showElementOutline(element, 'undo');    // amber
```

### ExpansionManager

```javascript
import { ExpansionManager } from './services/expansion-manager.js';

const manager = new ExpansionManager(selectorEngine, sessionManager);

// Find constrained container
const container = manager.findConstrainedContainer(element);

// Expand element
manager.expandElement(container, {
    mode: 'fit-content',
    clearAncestorConstraints: true
});

// Check if expanded
if (manager.isExpanded(container)) { }

// Undo expansion
manager.undo(container);

// Try undo on element or ancestors
if (manager.tryUndo(element)) { }

// Adjust height
const success = manager.adjustHeight(element, delta);

// Get last expanded element
const lastEl = manager.getLastExpandedElement();

// Cleanup
manager.cleanup();
```

### INTERACTIVE_ELEMENTS

```javascript
import { INTERACTIVE_ELEMENTS } from '../../shared/interactive-elements.js';

// Check if element is interactive
if (INTERACTIVE_ELEMENTS.isInteractive(element)) { }

// Find nearest interactive ancestor
const interactive = INTERACTIVE_ELEMENTS.findInteractiveAncestor(element);

// Access tag/role sets
INTERACTIVE_ELEMENTS.tags    // Set of interactive HTML tags
INTERACTIVE_ELEMENTS.roles   // Set of interactive ARIA roles
```

---

## Migration Examples

### Example 1: Shortcut Matching

**Before:**
```javascript
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
}
```

**After:**
```javascript
if (ShortcutMatcher.isCapture(e, this.captureShortcut)) {
    e.preventDefault();
    this._triggerMarkCapture();
}
```

---

### Example 2: Visual Feedback

**Before:**
```javascript
_showActionIcon(iconType) {
    const icons = { 'capture': '📸', 'expand': '📐', ... };
    const icon = icons[iconType] || '✓';
    const iconEl = document.createElement('div');
    iconEl.textContent = icon;
    iconEl.style.cssText = `...47 lines of CSS...`;
    // ... animation setup ...
    document.body.appendChild(iconEl);
    setTimeout(() => iconEl.remove(), 2000);
}
```

**After:**
```javascript
this.visualFeedback.showActionIcon('capture');
```

---

### Example 3: Element Expansion

**Before:**
```javascript
const container = this._findConstrainedContainer(el);
if (this._expandedElements.has(container)) {
    this._undoExpansion(container);
    return;
}
const originalStyles = this._applyExpansion(container);
this._expandedElements.set(container, originalStyles);
this._lastExpandedElement = container;
const selector = this.selectorEngine.getUniqueSelector(container);
this.sessionManager.startSession({
    type: 'expand',
    target: container,
    expandParams: { selector, mode: 'fit-content', ... }
});
```

**After:**
```javascript
const container = this.expansionManager.findConstrainedContainer(el);
if (this.expansionManager.isExpanded(container)) {
    this.expansionManager.undo(container);
    return;
}
this.expansionManager.expandElement(container, {
    mode: 'fit-content',
    clearAncestorConstraints: true
});
```

---

### Example 4: Interactive Element Detection

**Before:**
```javascript
_findInteractiveAncestor(el) {
    if (this._isInteractiveElement(el)) return el;
    let current = el.parentElement;
    while (current && current !== document.body) {
        if (this._isInteractiveElement(current)) return current;
        current = current.parentElement;
    }
    return el;
}
```

**After:**
```javascript
const resolvedEl = INTERACTIVE_ELEMENTS.findInteractiveAncestor(el);
```

---

## Initialization Pattern

### content.js

```javascript
async init() {
    const [
        { SelectorEngine },
        { SessionManager },
        { StateManager },
        { ShortcutMatcher },      // ← NEW
        { VisualFeedback },       // ← NEW
        { ExpansionManager },     // ← NEW
        { CONFIG, MESSAGE_ACTIONS }
    ] = await Promise.all([
        import(resolveModule('src/content/core/selector-engine.js')),
        import(resolveModule('src/content/core/session-manager.js')),
        import(resolveModule('src/content/core/state-manager.js')),
        import(resolveModule('src/content/services/shortcut-matcher.js')),
        import(resolveModule('src/content/ui/visual-feedback.js')),
        import(resolveModule('src/content/services/expansion-manager.js')),
        import(resolveModule('src/shared/constants.js'))
    ]);

    // Initialize core
    this.selectorEngine = new SelectorEngine();
    this.stateManager = new StateManager();
    this.sessionManager = new SessionManager(this.selectorEngine, ...);

    // Initialize services
    this.visualFeedback = new VisualFeedback();
    this.visualFeedback.initializeAnimations();

    this.expansionManager = new ExpansionManager(
        this.selectorEngine,
        this.sessionManager
    );

    // Note: ShortcutMatcher is static, no instantiation needed
}
```

---

## Testing Guide

### Unit Testing Services

```javascript
// test/shortcut-matcher.test.js
import { ShortcutMatcher } from '../src/content/services/shortcut-matcher.js';

test('matches capture shortcut', () => {
    const event = { ctrlKey: true, shiftKey: true, key: 'C' };
    const shortcut = { ctrl: true, shift: true, key: 'C' };
    expect(ShortcutMatcher.isCapture(event, shortcut)).toBe(true);
});

// test/visual-feedback.test.js
import { VisualFeedback } from '../src/content/ui/visual-feedback.js';

test('shows action icon', () => {
    const feedback = new VisualFeedback();
    feedback.initializeAnimations();
    feedback.showActionIcon('capture');
    expect(document.querySelector('div[style*="position: fixed"]')).toBeTruthy();
});

// test/expansion-manager.test.js
import { ExpansionManager } from '../src/content/services/expansion-manager.js';

test('finds constrained container', () => {
    const mockSelector = { getUniqueSelector: jest.fn() };
    const mockSession = { startSession: jest.fn() };
    const manager = new ExpansionManager(mockSelector, mockSession);

    const container = createMockContainer(); // helper
    const result = manager.findConstrainedContainer(container);
    expect(result).toBeTruthy();
});
```

---

## Troubleshooting

### Issue: "ShortcutMatcher is not defined"

**Cause:** Missing import or dynamic import failed

**Solution:**
```javascript
// Ensure import is in Promise.all
import(resolveModule('src/content/services/shortcut-matcher.js'))
```

---

### Issue: "visualFeedback.showActionIcon is not a function"

**Cause:** Service not initialized

**Solution:**
```javascript
// In constructor or init()
this.visualFeedback = new VisualFeedback();
this.visualFeedback.initializeAnimations();
```

---

### Issue: "Cannot read property 'expandElement' of undefined"

**Cause:** ExpansionManager not initialized

**Solution:**
```javascript
// In constructor or init()
this.expansionManager = new ExpansionManager(
    this.selectorEngine,
    this.sessionManager
);
```

---

## File Locations

```
extension/src/
├── content/
│   ├── content.js (618 lines) ← Modified
│   ├── core/
│   │   └── selector-engine.js (934 lines) ← Modified
│   ├── services/
│   │   ├── shortcut-matcher.js ✅ Integrated
│   │   └── expansion-manager.js ✅ Integrated
│   └── ui/
│       └── visual-feedback.js ✅ Integrated
└── shared/
    └── interactive-elements.js ✅ Integrated
```

---

## Documentation

| Document | Purpose |
|----------|---------|
| `REFACTORING_REPORT.md` | Analysis and planning |
| `REFACTORING_IMPLEMENTATION.md` | Detailed implementation |
| `REFACTORING_SUMMARY.md` | Executive summary |
| `ARCHITECTURE_COMPARISON.md` | Before/after comparison |
| `REFACTORING_QUICKREF.md` | This document |

---

## Checklist for Future Changes

When modifying content.js:

- [ ] Use `ShortcutMatcher` for shortcut checks (don't write inline logic)
- [ ] Use `visualFeedback.showActionIcon()` for visual feedback
- [ ] Use `visualFeedback.showElementOutline()` for element highlights
- [ ] Use `expansionManager` for expansion logic
- [ ] Don't duplicate interactive element detection (use `INTERACTIVE_ELEMENTS`)

When modifying selector-engine.js:

- [ ] Use `INTERACTIVE_ELEMENTS.findInteractiveAncestor()` for ancestor bubbling
- [ ] Use `INTERACTIVE_ELEMENTS.isInteractive()` for element checks
- [ ] Don't redefine `_interactiveTags` or `_interactiveRoles`

---

## Next Steps (Optional - Phase 2)

If further refactoring is desired:

1. **Strategy Pattern for Selector Strategies**
   - Extract 10 selector strategies to separate files
   - Create `SelectorValidator` utility
   - Reduce selector-engine.js from 934 → ~150 lines
   - Effort: 8-12 hours

See `REFACTORING_REPORT.md` Phase 2 section for details.

---

**Questions?** See full documentation in `REFACTORING_IMPLEMENTATION.md`
