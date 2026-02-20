# FlowCapture Extension - Refactoring Plan

## Overview
This document guides the modularization of FlowCapture extension from monolithic files to a service-based architecture.

**Estimated Time:** 8-12 hours
**Code Reduction:** ~400 lines (15-20% of total)
**Complexity Reduction:** ~40% easier to test and maintain

---

## Phase 1: COMPLETED ✅

### Created New Service Modules

1. **shortcut-matcher.js** (NEW)
   - Location: `src/content/services/shortcut-matcher.js`
   - Purpose: Consolidate shortcut matching logic
   - Exports: `ShortcutMatcher` class with static methods
   - Lines saved from content.js: ~100

2. **expansion-manager.js** (NEW)
   - Location: `src/content/services/expansion-manager.js`
   - Purpose: Encapsulate all element expansion logic
   - Exports: `ExpansionManager` class
   - Lines saved from content.js: ~200

3. **visual-feedback.js** (NEW)
   - Location: `src/content/ui/visual-feedback.js`
   - Purpose: Handle all visual feedback (icons, outlines, animations)
   - Exports: `VisualFeedback` class
   - Lines saved from content.js: ~80

4. **interactive-elements.js** (NEW)
   - Location: `src/shared/interactive-elements.js`
   - Purpose: Single source of truth for interactive element definitions
   - Exports: `INTERACTIVE_ELEMENTS`, `SEMANTIC_TAGS`, `FORM_INPUT_TAGS`
   - Eliminates duplication in: selector-engine.js, content.js

---

## Phase 2: IN PROGRESS (Next Steps)

### Step 1: Refactor content.js

**Lines to replace:** Multiple sections

**Changes:**
1. Import new services:
   ```javascript
   import { ShortcutMatcher } from './services/shortcut-matcher.js';
   import { ExpansionManager } from './services/expansion-manager.js';
   import { VisualFeedback } from './ui/visual-feedback.js';
   import { INTERACTIVE_ELEMENTS, FORM_INPUT_TAGS } from '../shared/interactive-elements.js';
   ```

2. In `_setupEventListeners()`:
   ```javascript
   // OLD (lines 198-222): Direct shortcut matching
   const es = this.expandShortcut;
   if (es &&
       e.ctrlKey === !!es.ctrl &&
       e.shiftKey === !!es.shift &&
       e.altKey === !!es.alt &&
       e.metaKey === !!es.meta &&
       e.key.toUpperCase() === es.key.toUpperCase()
   ) { ... }

   // NEW: Use ShortcutMatcher
   if (ShortcutMatcher.isExpand(e, this.expandShortcut)) {
       this._triggerExpandUnderCursor();
       return;
   }
   ```

3. In constructor, initialize services:
   ```javascript
   this.expansion = new ExpansionManager(this.selectorEngine, this.sessionManager);
   this.feedback = new VisualFeedback();
   ```

4. Replace expansion methods with delegation:
   ```javascript
   // OLD: _triggerExpandUnderCursor() contains 50+ lines
   // NEW:
   _triggerExpandUnderCursor() {
       const el = document.elementFromPoint(this._mouseX, this._mouseY);
       if (!el || el.id === 'flow-capture-overlay-root') return;

       const container = this.expansion.findConstrainedContainer(el);
       if (!container) {
           if (!this.expansion.tryUndo(el)) {
               this.overlay.showToast('No constrained container found', 'error');
           }
           return;
       }

       if (this.expansion.isExpanded(container)) {
           this.expansion.undo(container);
           return;
       }

       this.expansion.expandElement(container, { clearAncestorConstraints: true });
       this.overlay.showToast(`Expanded: ${container.scrollHeight}px`, 'success');
       this.feedback.showActionIcon('expand');
   }
   ```

5. Replace visual feedback calls:
   ```javascript
   // OLD (lines 814-825): Check and create animation CSS every call
   if (!document.getElementById('fc-icon-animation')) { ... }

   // NEW: Called once in init()
   this.feedback.initializeAnimations();

   // Then use:
   this.feedback.showActionIcon('capture');
   this.feedback.showElementOutline(el, 'success');
   ```

**Expected result:**
- content.js reduced from 892 → ~650 lines
- Improved testability (services can be tested in isolation)
- Cleaner event listeners

---

### Step 2: Refactor selector-engine.js

**Changes:**
1. Import interactive elements:
   ```javascript
   import { INTERACTIVE_ELEMENTS, SEMANTIC_TAGS } from '../../shared/interactive-elements.js';
   ```

2. Replace hardcoded tag/role lists (lines 36-38):
   ```javascript
   // OLD:
   this._interactiveTags = new Set(['BUTTON', 'A', 'INPUT', ...]);
   this._interactiveRoles = new Set(['button', 'link', 'tab', ...]);

   // NEW:
   this._interactiveTags = INTERACTIVE_ELEMENTS.tags;
   this._interactiveRoles = INTERACTIVE_ELEMENTS.roles;
   ```

3. Replace `_isInteractiveElement()` (lines 47-53):
   ```javascript
   // OLD: Checks tags and roles
   _isInteractiveElement(el) {
       if (this._interactiveTags.has(el.tagName)) return true;
       const role = el.getAttribute('role');
       if (role && this._interactiveRoles.has(role)) return true;
       if (el.hasAttribute('onclick') || el.getAttribute('tabindex') === '0') return true;
       return false;
   }

   // NEW: Use shared utility
   _isInteractiveElement(el) {
       return INTERACTIVE_ELEMENTS.isInteractive(el);
   }
   ```

4. Consolidate bogus value checks (optional - Phase 3):
   ```javascript
   // Create helper method to replace all 11 instances:
   _isValidValue(val, minLen = 1, maxLen = 100) {
       if (!val || typeof val !== 'string') return false;
       const trimmed = val.trim();
       return trimmed.length >= minLen && trimmed.length <= maxLen &&
              !this._isBogusValue(trimmed);
   }

   // Use: if (this._isValidValue(ariaLabel)) { ... }
   ```

**Expected result:**
- selector-engine.js reduced from 970 → ~920 lines
- Eliminated duplicate constants
- Better maintainability

---

### Step 3: Refactor popup.js

**Create new shortcut-recorder.js:**

```javascript
// NEW FILE: src/popup/services/shortcut-recorder.js
export class ShortcutRecorder {
    constructor(ui, storageManager) {
        this.ui = ui;
        this.storageManager = storageManager;
        this._isRecording = false;
        this._recordingType = null; // 'capture' or 'expand'
    }

    startRecording(type) {
        this._recordingType = type;
        this._isRecording = true;
        this.ui.setShortcutRecording(type === 'capture', true);
        this.ui.setExpandShortcutRecording(type === 'expand', true);

        const keydownListener = (e) => this._onKeydown(e, type);
        document.addEventListener('keydown', keydownListener);

        // Store reference for cleanup
        this._keydownListener = keydownListener;
    }

    _onKeydown(e, type) {
        e.preventDefault();
        const shortcut = {
            ctrl: e.ctrlKey,
            shift: e.shiftKey,
            alt: e.altKey,
            meta: e.metaKey,
            key: e.key
        };

        this.stopRecording();
        this._onShortcutRecorded(shortcut, type);
    }

    stopRecording() {
        if (!this._isRecording) return;

        this._isRecording = false;
        if (this._keydownListener) {
            document.removeEventListener('keydown', this._keydownListener);
            this._keydownListener = null;
        }

        this.ui.setShortcutRecording(this._recordingType === 'capture', false);
        this.ui.setExpandShortcutRecording(this._recordingType === 'expand', false);
    }

    async _onShortcutRecorded(shortcut, type) {
        const settings = await this.storageManager.get('fcSettings') || {};

        if (type === 'capture') {
            settings.captureShortcut = shortcut;
            this.ui.updateShortcutDisplay(shortcut);
        } else if (type === 'expand') {
            settings.expandShortcut = shortcut;
            this.ui.updateExpandShortcutDisplay(shortcut);
        }

        await this.storageManager.set('fcSettings', settings);
        this.ui.showToast(`${type} shortcut updated`, 'success');
    }
}
```

**Changes to popup.js:**
1. Import the service
2. Initialize: `this.shortcutRecorder = new ShortcutRecorder(this.ui, this.storageManager);`
3. Replace lines 425-517 with:
   ```javascript
   onShortcutRecord() {
       this.shortcutRecorder.startRecording('capture');
   }

   onExpandShortcutRecord() {
       this.shortcutRecorder.startRecording('expand');
   }
   ```

4. Fix timer cleanup (lines 66-67):
   ```javascript
   // OLD:
   window.addEventListener('unload', () => this.timer.stop());

   // NEW:
   window.addEventListener('unload', () => {
       this.timer.stop();
       chrome.runtime.onMessage.removeListener(this._messageListener);
       this.shortcutRecorder?.stopRecording();
   });
   ```

**Expected result:**
- popup.js reduced from 523 → ~350 lines
- Eliminated ~150 lines of duplication
- Fixed memory leak on unload
- Better separation of concerns

---

## Phase 3: OPTIONAL (Future Optimization)

### Additional Service Extractions (Lower priority)

1. **uniqueness-validator.js** (selector-engine.js)
   - Extract: CSS/XPath uniqueness checks
   - Lines saved: ~60

2. **predicate-builder.js** (selector-engine.js)
   - Extract: XPath predicate generation
   - Lines saved: ~100

3. **intent-processor.js** (popup.js)
   - Extract: Intent validation + workflow generation
   - Lines saved: ~80

4. **chrome-api-wrapper.js** (popup.js)
   - Extract: Chrome tabs/scripting API calls
   - Lines saved: ~50

---

## Testing Strategy

After each refactoring phase:

### Unit Tests (for services)

```javascript
// test/shortcut-matcher.test.js
describe('ShortcutMatcher', () => {
    it('should match event to shortcut config', () => {
        const event = new KeyboardEvent('keydown', {
            ctrlKey: true,
            shiftKey: true,
            key: 'C'
        });
        const shortcut = { ctrl: true, shift: true, alt: false, meta: false, key: 'C' };
        expect(ShortcutMatcher.matches(event, shortcut)).toBe(true);
    });
});
```

### Integration Tests (for content.js)

```javascript
// test/expansion-manager.test.js
describe('ExpansionManager', () => {
    it('should find constrained container', () => {
        // Mock DOM element
        // Test expansion logic
    });
});
```

### Manual Testing

1. Load extension in Chrome
2. Record interactions on test page
3. Verify all visual feedback works (icons, outlines)
4. Test expansion shortcut (Ctrl+Shift+E)
5. Test manual height adjustment (Ctrl+Shift+Up/Down)
6. Download workflow and verify format

---

## Rollback Plan

If issues arise:
1. Keep old files in `src/content/legacy/` temporarily
2. Use git feature branch (already done: `pw` branch)
3. Revert specific imports if a service has bugs
4. Test each service in isolation before integration

---

## Performance Impact

**Expected improvements:**
- ✅ Smaller main content script (faster load)
- ✅ Services lazy-load only when needed
- ✅ Better memory management (WeakMap isolation)
- ✅ No performance regression (same algorithms)

**Measurement:**
- Before: content.js size, bundle size
- After: Compare with build metrics

---

## Files Modified Summary

| File | Lines Changed | Type |
|------|---------------|------|
| content.js | ~250 | Refactor (reduce from 892→650) |
| selector-engine.js | ~50 | Refactor (reduce from 970→920) |
| popup.js | ~175 | Refactor (reduce from 523→350) |
| **NEW:** shortcut-matcher.js | +60 | New service |
| **NEW:** expansion-manager.js | +170 | New service |
| **NEW:** visual-feedback.js | +80 | New service |
| **NEW:** interactive-elements.js | +60 | New shared constants |
| **TOTAL** | ~-100 lines | Net reduction |

---

## Progress Tracking

- [x] Phase 1: Create service modules
  - [x] shortcut-matcher.js
  - [x] expansion-manager.js
  - [x] visual-feedback.js
  - [x] interactive-elements.js

- [ ] Phase 2: Refactor main files
  - [ ] Update content.js imports
  - [ ] Replace expansion logic with ExpansionManager
  - [ ] Replace visual feedback with VisualFeedback
  - [ ] Replace shortcut matching with ShortcutMatcher
  - [ ] Update selector-engine.js imports
  - [ ] Create shortcut-recorder.js for popup
  - [ ] Update popup.js with ShortcutRecorder
  - [ ] Fix window.unload cleanup
  - [ ] Test all functionality

- [ ] Phase 3: Optional optimizations
  - [ ] Extract uniqueness-validator.js
  - [ ] Extract predicate-builder.js
  - [ ] Extract intent-processor.js
  - [ ] Extract chrome-api-wrapper.js

---

## Notes for Next Session

**To continue refactoring:**
1. Start with content.js - it has the most extracted services ready
2. Use `ShortcutMatcher.isExpand()` to replace shortcut matching blocks
3. Use `new ExpansionManager()` to replace all expansion methods
4. Initialize `VisualFeedback` once in `init()` - call `initializeAnimations()`
5. Import `INTERACTIVE_ELEMENTS` in selector-engine.js

**Key files to update:**
- `C:\Users\João\Desktop\FlowCapture\extension\src\content\content.js` (892 lines)
- `C:\Users\João\Desktop\FlowCapture\extension\src\content\core\selector-engine.js` (970 lines)
- `C:\Users\João\Desktop\FlowCapture\extension\src\popup\popup.js` (523 lines)

**Next commit message:**
```
refactor: modularize extension into service-based architecture (Phase 2)

- Replace shortcut matching with ShortcutMatcher service
- Replace expansion logic with ExpansionManager service
- Replace visual feedback with VisualFeedback service
- Use shared INTERACTIVE_ELEMENTS constants
- Fix window.unload memory leak in popup.js
- Reduce content.js from 892 → 650 lines
- Reduce popup.js from 523 → 350 lines
- Improve testability with isolated service modules
```
