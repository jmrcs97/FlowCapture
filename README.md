# FlowCapture - Intent Recorder

<div align="center">

**Capture user interactions and visual changes automatically for UI testing and automation**

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=google-chrome&logoColor=white)](https://www.google.com/chrome/)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)](https://developer.chrome.com/docs/extensions/mv3/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

</div>

---

## 🎯 What is FlowCapture?

FlowCapture is a Chrome extension that **records user interactions and automatically detects visual changes** on web pages. It generates structured JSON data that can be used for:

- 🤖 **Test automation** - Generate test scripts from real user behavior
- 🐛 **Bug reporting** - Document exact steps and visual changes when reporting issues
- 📊 **UI/UX analysis** - Understand how interfaces respond to user actions
- 🔄 **Regression testing** - Compare UI behavior across different versions

Unlike traditional screen recorders, FlowCapture captures **semantic data** about what changed in the DOM and CSS, not just pixels.

---

## ✨ Key Features

### 🎬 Automatic Event Capture
- **Clicks** - Records which elements were clicked
- **Input changes** - Captures form field values, checkboxes, selects
- **Scroll events** - Tracks scroll position and distance
- **Visual changes** - Detects height, width, opacity changes automatically

### 🎨 Smart Visual Tracking
- Filters out noise (animations, small position changes)
- Focuses on significant changes (height/width > 5px)
- Prioritizes important properties over cosmetic ones
- Limits output to top 15 most relevant changes per interaction

### 📦 Clean JSON Output
```json
{
  "step_id": "abc123",
  "trigger": {
    "type": "click",
    "selector": "button.submit-btn"
  },
  "visual_changes": [
    {
      "selector": "div.modal",
      "property": "height",
      "before": 0,
      "after": 500,
      "delta": 500
    }
  ],
  "duration_ms": 350
}
```

### 🎛️ Minimal UI Overlay
- **Minimized mode** - Small red dot while recording
- **Hover to expand** - Shows timer and event count
- **Always visible** - Overlay stays on top during navigation

---

## 🚀 How It Works

### Architecture

```
┌─────────────────┐
│  Popup UI       │ ← User starts/stops recording
└────────┬────────┘
         │
    ┌────▼────────────────────────────────┐
    │  Content Script (Injected)          │
    │  ┌──────────────────────────────┐  │
    │  │ Event Listeners              │  │
    │  │ • Click, Input, Scroll       │  │
    │  └──────────┬───────────────────┘  │
    │             │                       │
    │  ┌──────────▼───────────────────┐  │
    │  │ Layout Stabilizer            │  │
    │  │ • Detects visual changes     │  │
    │  │ • Waits for animations       │  │
    │  └──────────┬───────────────────┘  │
    │             │                       │
    │  ┌──────────▼───────────────────┐  │
    │  │ Mutation Observer            │  │
    │  │ • Tracks DOM changes         │  │
    │  │ • Monitors class changes     │  │
    │  └──────────┬───────────────────┘  │
    │             │                       │
    │  ┌──────────▼───────────────────┐  │
    │  │ Data Filter & Aggregator     │  │
    │  │ • Removes noise              │  │
    │  │ • Prioritizes changes        │  │
    │  │ • Generates clean JSON       │  │
    │  └──────────────────────────────┘  │
    └─────────────────────────────────────┘
```

### Recording Flow

1. **User clicks "Start Recording"**
   - Overlay appears (minimized red dot)
   - Event listeners activate
   - Mutation observer starts watching DOM

2. **User interacts with page**
   - Each click/input/scroll creates a new "session"
   - Layout Stabilizer tracks visual changes for ~250-3000ms
   - Detects when animations finish and layout stabilizes

3. **Session finalizes**
   - Compares DOM/CSS before vs after
   - Filters out insignificant changes
   - Stores only top 15 most important visual changes
   - Simplified selectors for readability

4. **User clicks "Stop"**
   - Final session is finalized
   - JSON is ready for download
   - Contains all steps with visual diffs

---

## 📥 Installation

### From Source (Development)

1. **Clone or download this repository**
   ```bash
   cd FlowCapture/extension
   ```

2. **Open Chrome Extensions page**
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode" (top right)

3. **Load the extension**
   - Click "Load unpacked"
   - Select the `extension` folder

4. **Done!** The FlowCapture icon should appear in your toolbar

---

## 📖 Usage Guide

### Basic Recording

1. **Open any website** you want to test
2. **Click the FlowCapture icon** in your toolbar
3. **Click "Start Recording"** in the popup
   - A red pulsing dot appears (bottom right)
   - Timer starts counting
4. **Interact with the page** normally
   - Click buttons
   - Fill forms
   - Scroll
   - Open modals
5. **Hover over the red dot** to see progress
   - Current timer
   - Number of events captured
6. **Click "Stop Recording"**
   - Recording ends
   - "Download" button appears
7. **Click "Download Result"** to get your JSON file

### Using Checkpoints

While recording, you can capture "checkpoint" snapshots:
- **Hover over the overlay**
- **Click "📸 Snapshot"**
- Captures current page state without user interaction

### Reading the Output

Each step in the JSON contains:

```json
{
  "step_id": "unique_id",
  "trigger": {
    "type": "click|input_change|scroll|checkpoint",
    "selector": "button.submit",
    "timestamp": 1234567890,
    "value": "..."  // for inputs
  },
  "visual_changes": [
    {
      "selector": "div.modal",
      "property": "height|width|opacity|display|visibility",
      "before": 0,
      "after": 500,
      "delta": 500
    }
  ],
  "class_changes": [
    {
      "selector": "body",
      "attribute": "class",
      "old_value": "...",
      "new_value": "... modal-open"
    }
  ],
  "body_class_changes": {
    "added": ["modal-open"],
    "removed": []
  },
  "duration_ms": 350
}
```

---

## 🎯 Use Cases

### 1. Modal Testing
Record opening/closing modals to verify:
- Height/width changes
- Opacity transitions
- Body class changes (`modal-open`)
- Background overlays appearing

### 2. Form Validation
Capture:
- Input field changes
- Error message appearances
- Visual feedback (borders, colors)

### 3. Responsive Behavior
Test:
- Element resizing
- Layout shifts
- Content reflow

### 4. Animation Verification
Ensure:
- Transitions complete correctly
- Final states are consistent
- No unexpected layout shifts

---

## ⚙️ Configuration

### Adjusting Visual Change Thresholds

Edit `src/content/content.js` line ~304:

```javascript
const properties = [
  { name: 'height', threshold: 5, priority: 1 },    // Ignore < 5px
  { name: 'width', threshold: 5, priority: 1 },
  { name: 'opacity', threshold: 0.01, priority: 2 },
  // ...
];
```

### Limiting Results

Maximum changes per interaction (line ~352):
```javascript
analysis.visual_summary = visualSummary.slice(0, 15); // Top 15
```

Maximum class changes (line ~357):
```javascript
if (m.type === 'attributes' && analysis.attribute_changes.length < 5)
```

---

## 🛠️ Technical Details

### Technologies Used
- **Manifest V3** - Latest Chrome extension standard
- **MutationObserver API** - DOM change detection
- **ResizeObserver** - Dimension tracking
- **RequestAnimationFrame** - Visual change polling

### Performance Optimizations
- Debounced scroll tracking (150ms)
- Animation stabilization with timeout (max 3s)
- Limited candidate tracking (only relevant elements)
- Filtered selectors (removes utility classes)

### Privacy & Security
- **All processing happens locally** - No data sent to servers
- **No external dependencies** - Pure vanilla JavaScript
- **Minimal permissions** - Only `activeTab`, `scripting`, `storage`

---

## 📂 Project Structure

```
FlowCapture/
├── extension/
│   ├── manifest.json          # Extension config
│   ├── src/
│   │   ├── background/
│   │   │   └── background.js  # Service worker
│   │   ├── content/
│   │   │   └── content.js     # Main recording logic
│   │   └── popup/
│   │       ├── popup.html     # Extension popup UI
│   │       └── popup.js       # Popup controls
│   └── icons/                 # Extension icons
└── README.md                  # This file
```

---

## 🤝 Contributing

Contributions are welcome! Areas for improvement:

- [ ] Export to different formats (Playwright, Puppeteer, Cypress)
- [ ] Visual regression comparison tool
- [ ] Network request tracking
- [ ] Screenshot capture integration
- [ ] Keyboard event recording

---

## 📝 License

MIT License - Feel free to use this tool for any purpose.

---

## 🙏 Acknowledgments

Built with modern web APIs and designed for developers who need precise UI behavior tracking without the noise of traditional DOM inspection tools.

---

<div align="center">

**[Report Bug](https://github.com/yourusername/FlowCapture/issues)** · **[Request Feature](https://github.com/yourusername/FlowCapture/issues)**

Made with ❤️ for QA engineers and UI developers

</div>
