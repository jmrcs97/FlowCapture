document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');
    const downloadLink = document.getElementById('download-btn');
    const cameraBtn = document.getElementById('camera-btn');

    const stateIdle = document.getElementById('state-idle');
    const stateRecording = document.getElementById('state-recording');

    const timerDisplay = document.getElementById('timer');
    const eventCountDisplay = document.getElementById('event-count');

    let timerInterval;
    let startTime;

    function formatTime(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
        const seconds = (totalSeconds % 60).toString().padStart(2, '0');
        return `${minutes}:${seconds}`;
    }

    function startTimer(startTimestamp) {
        startTime = startTimestamp || Date.now();
        timerInterval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            timerDisplay.textContent = formatTime(elapsed);
        }, 1000);
    }

    function stopTimer() {
        clearInterval(timerInterval);
    }

    function updateUI(isRecording, eventCount = 0) {
        if (isRecording) {
            stateIdle.style.display = 'none';
            stateRecording.style.display = 'flex';
            startBtn.disabled = true;
            if (cameraBtn) {
                cameraBtn.disabled = false;
                cameraBtn.classList.remove('disabled');
            }
            downloadLink.classList.add('disabled');
            // We assume start time was saved or we just restart for UI simplicity if reloading
            if (!timerInterval) startTimer(Date.now());
        } else {
            stateIdle.style.display = 'flex';
            stateRecording.style.display = 'none';
            startBtn.disabled = false;
            if (cameraBtn) {
                cameraBtn.disabled = true;
                cameraBtn.classList.add('disabled');
            }
            stopTimer();
            if (eventCount > 0) {
                downloadLink.classList.remove('disabled');
                downloadLink.innerHTML = `<span class="material-icons-round">download</span><span>Download Intent (${eventCount} steps)</span>`;
            }
        }
        eventCountDisplay.innerText = eventCount;
    }

    // Load status from storage on popup open
    chrome.storage.local.get(['isRecording', 'startTime', 'eventCount', 'intentData'], (result) => {
        if (result.isRecording) {
            updateUI(true, result.eventCount || 0);
            if (result.startTime) {
                stopTimer(); // clear any existing
                startTimer(result.startTime); // resume from stored time
            }
        } else if (result.intentData) {
            // Ready to download
            updateUI(false, result.intentData.intent_analysis ? result.intentData.intent_analysis.steps.length : 0);
        }
    });

    startBtn.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]) return;

            const now = Date.now();
            chrome.storage.local.set({ isRecording: true, startTime: now, eventCount: 0 });

            chrome.tabs.sendMessage(tabs[0].id, { action: 'startRecording' }, (response) => {
                if (chrome.runtime.lastError) {
                    alert('Please refresh the page before recording.');
                    return;
                }
                updateUI(true, 0);
                // Dispatch start timer explicitly
                stopTimer();
                startTimer(now);
            });
        });
    });

    if (cameraBtn) {
        cameraBtn.addEventListener('click', () => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (!tabs[0]) return;
                chrome.tabs.sendMessage(tabs[0].id, { action: 'captureState' }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error("Capture failed:", chrome.runtime.lastError);
                        return;
                    }
                    // UI will update via listener
                });
            });
        });
    }

    stopBtn.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]) return;

            chrome.tabs.sendMessage(tabs[0].id, { action: 'stopRecording' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("Stop failed:", chrome.runtime.lastError);
                    // Force UI reset anyway
                    chrome.storage.local.set({ isRecording: false });
                    updateUI(false, 0);
                    return;
                }
                const count = response && response.count ? response.count : 0;
                chrome.storage.local.set({ isRecording: false, eventCount: count });
                updateUI(false, count);
            });
        });
    });

    // Listen for real-time updates from content script
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.action === 'intentUpdated') {
            eventCountDisplay.innerText = msg.count;
            chrome.storage.local.set({ eventCount: msg.count });
        }
    });

    downloadLink.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]) return;
            chrome.tabs.sendMessage(tabs[0].id, { action: 'getIntent' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("Download failed:", chrome.runtime.lastError);
                    alert("Could not retrieve data. Page might have been reloaded.");
                    return;
                }
                if (!response || !response.intent) {
                    alert('No intent data found');
                    return;
                }
                const intent = response.intent;
                chrome.storage.local.set({ intentData: intent }); // Cache it

                const blob = new Blob([JSON.stringify(intent, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'automation_intent.json';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            });
        });
    });
});
