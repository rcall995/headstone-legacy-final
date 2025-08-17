let deferredPrompt;

// Call this from the main app to capture the event
export function captureInstallPrompt(event) {
    event.preventDefault();
    deferredPrompt = event;
    // Let the rest of the app know that the install prompt is available
    window.dispatchEvent(new CustomEvent('pwa-prompt-available'));
}

// Any part of the app can call this to get the captured event
export function getInstallPrompt() {
    return deferredPrompt;
}

// Reset the prompt after it's been used
export function resetInstallPrompt() {
    deferredPrompt = null;
}