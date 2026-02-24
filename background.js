// Background script para abrir o Side Panel
chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));

// Opcional: Abrir automaticamente apenas no Facebook
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
    if (!tab.url) return;
    const url = new URL(tab.url);

    if (url.origin.includes('facebook.com')) {
        await chrome.sidePanel.setOptions({
            tabId,
            path: 'index.html',
            enabled: true
        });
    } else {
        // Desabilitar em outros sites se preferir
        await chrome.sidePanel.setOptions({
            tabId,
            enabled: false
        });
    }
});
