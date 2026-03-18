chrome.runtime.onInstalled.addListener(() => {
    console.log("FlowCapture: Background Service Worker Loaded");
});

chrome.action.onClicked.addListener((tab) => {
    if (tab.id) {
        // Try to toggle overlay
        chrome.tabs.sendMessage(tab.id, { action: "toggleOverlay" })
            .then(() => console.log("FlowCapture: Toggle sent to tab", tab.id))
            .catch(err => {
                console.warn("FlowCapture: Could not send toggleOverlay. Injecting content script...", err);

                // Fallback: Inject content script if missing (e.g. after install)
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['src/content/content.js']
                }).then(() => {
                    setTimeout(() => {
                        chrome.tabs.sendMessage(tab.id, { action: "toggleOverlay" });
                    }, 500);
                }).catch(e => console.error("FlowCapture: Injection failed", e));
            });
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'BG_LOG') {
        console.log('Log from content:', message.data);
    }

    if (message.type === 'SYNC_WORKFLOW') {
        fetch('http://localhost:3000/api/workflows/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(message.data)
        })
        .then(response => response.json())
        .then(data => sendResponse({ success: true, data }))
        .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Keep message channel open for async response
    }
});
