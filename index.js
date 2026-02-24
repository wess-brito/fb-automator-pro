// --- Script que será injetado no Facebook ---
const FB_INVITE_LOGIC = async (config) => {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const log = (msg) => { try { chrome.runtime.sendMessage({ type: 'LOG', message: msg }); } catch (e) { } };
    const notifySuccess = () => { try { chrome.runtime.sendMessage({ type: 'INVITE_SUCCESS' }); } catch (e) { } };

    let isPaused = false;
    let isStopped = false;

    const messageHandler = (request) => {
        if (request.type === 'COMMAND_PAUSE') {
            isPaused = true;
            log('⏸️ Automação pausada.');
        } else if (request.type === 'COMMAND_RESUME') {
            isPaused = false;
            log('▶️ Automação retomada.');
        } else if (request.type === 'COMMAND_STOP') {
            isStopped = true;
            log('🛑 Parada solicitada.');
        }
    };

    chrome.runtime.onMessage.addListener(messageHandler);

    const findScrollableModal = () => {
        const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]'));
        if (dialogs.length === 0) return null;
        const reactionDialog = dialogs.find(dialog => {
            const hasInviteBtn = dialog.querySelector('div[aria-label*="onvidar"], div[aria-label*="nvite"], div[role="button"]');
            if (!hasInviteBtn) return false;
            const text = hasInviteBtn.innerText?.toLowerCase() || "";
            return text.includes("convidar") || text.includes("invite");
        });
        const target = reactionDialog || dialogs[dialogs.length - 1];
        const allDivs = Array.from(target.querySelectorAll('div'));
        const scrollables = allDivs.filter(el => {
            const style = window.getComputedStyle(el);
            return (style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
        });
        return scrollables.sort((a, b) => b.scrollHeight - a.scrollHeight)[0] || target;
    };

    const triggerClick = async (el) => {
        ['mousedown', 'mouseup', 'click'].forEach(evt => {
            el.dispatchEvent(new MouseEvent(evt, { view: window, bubbles: true, cancelable: true, buttons: 1 }));
        });
    };

    const getInviteButtons = (container) => {
        const scope = container || document;
        const selectors = ['div[aria-label*="onvidar"]', 'div[aria-label*="nvite"]', 'div[role="button"]', 'span[role="button"]', 'button'];
        return Array.from(scope.querySelectorAll(selectors.join(','))).filter(el => {
            const hText = (el.innerText || el.getAttribute('aria-label') || '').trim().toLowerCase();
            const isInvite = hText.includes('convidar') || hText.includes('invite');
            const isDone = ['convidado', 'invited', 'enviado', 'sent', 'pendente', 'pending'].some(term => hText.includes(term));
            return isInvite && !isDone && el.offsetParent !== null;
        });
    };

    const modal = findScrollableModal();
    if (!modal) {
        log('❌ Falha: Modal de reações não encontrado.');
        chrome.runtime.onMessage.removeListener(messageHandler);
        return 0;
    }

    log(`🚀 Iniciando Automação...`);
    let totalInvited = 0;
    let scrollRetries = 0;
    let lastHeight = modal.scrollHeight;

    try {
        while (totalInvited < config.maxInvites && !isStopped) {
            // Check for pause
            while (isPaused && !isStopped) {
                await sleep(500);
            }
            if (isStopped) break;

            const buttons = getInviteButtons(modal);
            if (buttons.length > 0) {
                for (const btn of buttons) {
                    if (totalInvited >= config.maxInvites || isStopped) break;

                    while (isPaused && !isStopped) {
                        await sleep(500);
                    }
                    if (isStopped) break;

                    try {
                        btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        await sleep(600);
                        await triggerClick(btn);
                        totalInvited++;
                        notifySuccess();
                        log(`✅ Convite ${totalInvited}/${config.maxInvites} enviado.`);
                        await sleep((config.delay * 1000) + (Math.random() * 800));
                    } catch (err) { }
                }
            } else {
                modal.scrollTop = modal.scrollHeight;
                await sleep(2500);
                if (modal.scrollHeight > lastHeight) {
                    lastHeight = modal.scrollHeight;
                    scrollRetries = 0;
                } else {
                    if (modal.querySelector('[role="progressbar"]')) {
                        await sleep(3000);
                        continue;
                    }
                    scrollRetries++;
                    if (scrollRetries >= 3) break;
                    modal.scrollTop -= 300;
                    await sleep(800);
                    modal.scrollTop = modal.scrollHeight;
                }
            }
        }
    } finally {
        chrome.runtime.onMessage.removeListener(messageHandler);
        log(`🏁 Processo concluído. Total: ${totalInvited}`);
        chrome.runtime.sendMessage({ type: 'AUTOMATION_FINISHED' });
    }
    return totalInvited;
};

// --- Controle da Interface da Extensão ---
document.addEventListener('DOMContentLoaded', () => {
    const btnStart = document.getElementById('btn-start');
    const btnSettings = document.getElementById('btn-settings');
    const btnBack = document.getElementById('btn-back');
    const logList = document.getElementById('log-list');
    const statTotal = document.getElementById('stat-total');
    const statDaily = document.getElementById('stat-daily');
    const statStatus = document.getElementById('stat-status');
    const mainView = document.getElementById('main-view');
    const settingsView = document.getElementById('settings-view');
    const fbDetect = document.getElementById('fb-detect');

    // Inputs
    const inputLimit = document.getElementById('input-limit');
    const selectDelay = document.getElementById('select-delay');

    let invitedSession = 0;
    let dailyTotal = 0;
    const DAILY_MAX = 1050;

    const updateDailyDisplay = () => {
        if (statDaily) {
            statDaily.textContent = `${dailyTotal}/${DAILY_MAX}`;
            statDaily.style.color = dailyTotal >= DAILY_MAX ? '#ff5252' : '#1877F2';
        }
    };

    const addLog = (msg) => {
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        if (msg.includes('❌') || msg.includes('🚫')) entry.style.color = '#ff5252';
        if (msg.includes('✅')) entry.style.color = '#4caf50';
        entry.textContent = `[${time}] ${msg}`;
        const empty = logList.querySelector('.log-empty');
        if (empty) empty.remove();
        logList.insertBefore(entry, logList.firstChild);
    };

    // Load Settings
    if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.get(['inviteLimit', 'delayTime', 'dailyCount', 'lastReset'], (res) => {
            if (res.inviteLimit) inputLimit.value = res.inviteLimit;
            else inputLimit.value = 1000;
            if (res.delayTime) selectDelay.value = res.delayTime;

            const now = Date.now();
            if (res.lastReset && now - res.lastReset < 86400000) {
                dailyTotal = res.dailyCount || 0;
            } else {
                dailyTotal = 0;
                chrome.storage.local.set({ dailyCount: 0, lastReset: now });
            }
            updateDailyDisplay();
        });
    }

    // Save Settings
    const saveSettings = () => {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.set({
                inviteLimit: Number(inputLimit.value),
                delayTime: Number(selectDelay.value)
            });
        }
    };
    inputLimit.addEventListener('change', saveSettings);
    selectDelay.addEventListener('change', saveSettings);

    // Listener para mensagens do script injetado (Logs em tempo real)
    if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.onMessage.addListener((request) => {
            if (request.type === 'LOG') addLog(request.message);
            if (request.type === 'INVITE_SUCCESS') {
                invitedSession++;
                dailyTotal++;
                statTotal.textContent = invitedSession;
                updateDailyDisplay();
                chrome.storage.local.set({ dailyCount: dailyTotal });
            }
            if (request.type === 'AUTOMATION_FINISHED') {
                setButtonStyle('idle');
            }
        });
    }

    // Verificar se está no Facebook
    if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const isFB = tabs[0]?.url?.includes('facebook.com');
            if (!isFB) {
                fbDetect.style.background = '#ffebee';
                fbDetect.style.borderColor = '#ffcdd2';
                fbDetect.querySelector('span').textContent = 'Acesse o Facebook';
                fbDetect.querySelector('span').style.color = '#c62828';
                btnStart.disabled = true;
            }
        });
    } else {
        // Modo de desenvolvimento / fora da extensão
        fbDetect.style.background = '#e8f5e9';
        fbDetect.querySelector('span').textContent = 'Modo Simulação (Dev)';
    }

    let currentStatus = 'idle'; // idle, running, paused

    const setButtonStyle = (status) => {
        currentStatus = status;
        const span = btnStart.querySelector('span');
        const svg = btnStart.querySelector('svg');

        btnStart.classList.remove('btn-pause', 'btn-resume');

        if (status === 'running') {
            btnStart.classList.add('btn-pause');
            span.textContent = 'Pausar Automação';
            svg.innerHTML = '<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>';
            statStatus.textContent = 'Executando...';
        } else if (status === 'paused') {
            btnStart.classList.add('btn-resume');
            span.textContent = 'Retomar Automação';
            svg.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"></polygon>';
            statStatus.textContent = 'Pausado';
        } else {
            span.textContent = 'Iniciar Automação';
            svg.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"></polygon>';
            statStatus.textContent = 'Aguardando';
            btnStart.disabled = false;
        }
    };

    // Ação Iniciar / Pausar / Retomar
    btnStart.addEventListener('click', async () => {
        if (currentStatus === 'running') {
            // Pausar
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                chrome.tabs.sendMessage(tabs[0].id, { type: 'COMMAND_PAUSE' });
            });
            setButtonStyle('paused');
            return;
        }

        if (currentStatus === 'paused') {
            // Retomar
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                chrome.tabs.sendMessage(tabs[0].id, { type: 'COMMAND_RESUME' });
            });
            setButtonStyle('running');
            return;
        }

        // Iniciar
        if (dailyTotal >= DAILY_MAX) {
            addLog("🚫 Limite diário de 1050 atingido.");
            return;
        }

        setButtonStyle('running');
        invitedSession = 0;
        statTotal.textContent = "0";
        addLog('🚀 Iniciando automação...');

        try {
            if (typeof chrome !== 'undefined' && chrome.scripting) {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                const allowed = Math.min(Number(inputLimit.value), DAILY_MAX - dailyTotal);

                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: FB_INVITE_LOGIC,
                    args: [{ maxInvites: allowed, delay: Number(selectDelay.value) }]
                });
            } else {
                addLog('Simulação: Modo Dev.');
                for (let i = 0; i < 5; i++) {
                    if (currentStatus === 'idle') break;
                    while (currentStatus === 'paused') await new Promise(r => setTimeout(r, 500));
                    await new Promise(r => setTimeout(r, 1000));
                    invitedSession++; dailyTotal++;
                    statTotal.textContent = invitedSession;
                    updateDailyDisplay();
                }
                setButtonStyle('idle');
            }
        } catch (err) {
            addLog('❌ Erro: ' + err.message);
            setButtonStyle('idle');
        }
    });

    // Navegação
    btnSettings.addEventListener('click', () => { mainView.classList.add('hidden'); settingsView.classList.remove('hidden'); });
    btnBack.addEventListener('click', () => { settingsView.classList.add('hidden'); mainView.classList.remove('hidden'); });
});
