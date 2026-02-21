// --- Script que será injetado no Facebook ---
const FB_INVITE_LOGIC = async (config) => {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const log = (msg) => { try { chrome.runtime.sendMessage({ type: 'LOG', message: msg }); } catch (e) { } };
    const notifySuccess = () => { try { chrome.runtime.sendMessage({ type: 'INVITE_SUCCESS' }); } catch (e) { } };

    const findScrollableModal = () => {
        // Encontrar todos os diálogos/modais abertos
        const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]'));
        if (dialogs.length === 0) return null;

        // Procurar o diálogo que contém botões de convite (o modal das reações)
        const reactionDialog = dialogs.find(dialog => {
            const hasInviteBtn = dialog.querySelector('div[aria-label*="onvidar"], div[aria-label*="nvite"], div[role="button"]');
            if (!hasInviteBtn) return false;

            const text = hasInviteBtn.innerText?.toLowerCase() || "";
            return text.includes("convidar") || text.includes("invite");
        });

        const target = reactionDialog || dialogs[dialogs.length - 1]; // Fallback para o último se não achar pelo botão

        // Encontrar o maior container rolável dentro do modal escolhido
        const allDivs = Array.from(target.querySelectorAll('div'));
        const scrollables = allDivs.filter(el => {
            const style = window.getComputedStyle(el);
            const hasOverflow = style.overflowY === 'auto' || style.overflowY === 'scroll';
            return hasOverflow && el.scrollHeight > el.clientHeight;
        });

        const bestScrollable = scrollables.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
        return bestScrollable || target;
    };

    const triggerClick = async (el) => {
        const events = ['mousedown', 'mouseup', 'click'];
        events.forEach(evt => {
            el.dispatchEvent(new MouseEvent(evt, {
                view: window,
                bubbles: true,
                cancelable: true,
                buttons: 1
            }));
        });
    };

    const getInviteButtons = (container) => {
        const scope = container || document;
        const selectors = [
            'div[aria-label*="onvidar"]',
            'div[aria-label*="nvite"]',
            'div[role="button"]',
            'span[role="button"]',
            'button'
        ];
        const candidates = Array.from(scope.querySelectorAll(selectors.join(',')));
        return candidates.filter(el => {
            const hText = el.innerText?.trim().toLowerCase() || el.getAttribute('aria-label')?.trim().toLowerCase() || '';

            // Verifica se é um botão de convite (Português ou Inglês)
            const isInvite = hText.includes('convidar') || hText.includes('invite');

            // Verifica se já foi convidado/enviado
            const isDone = hText.includes('convidado') || hText.includes('invited') ||
                hText.includes('enviado') || hText.includes('sent') ||
                hText.includes('pendente') || hText.includes('pending');

            // O botão deve ser um "Invite" e NÃO pode estar "Done"
            return isInvite && !isDone && el.offsetParent !== null;
        });
    };

    const modal = findScrollableModal();
    if (!modal) {
        log('❌ Falha: Modal de reações não encontrado.');
        return 0;
    }

    log(`🚀 Iniciando Automação...`);
    log(`⚙️ Configuração: Limite=${config.maxInvites}, Pausa=${config.delay}s`);

    let totalInvited = 0;
    let scrollRetries = 0;
    let lastHeight = modal.scrollHeight;

    while (totalInvited < config.maxInvites) {
        const buttons = getInviteButtons(modal);

        if (buttons.length > 0) {
            log(`🔎 Encontrados ${buttons.length} botões de convite disponíveis.`);
            for (const btn of buttons) {
                if (totalInvited >= config.maxInvites) break;
                try {
                    // Pequena pausa para garantir visibilidade
                    btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await sleep(600);

                    await triggerClick(btn);
                    totalInvited++;
                    notifySuccess();

                    log(`✅ Convite ${totalInvited}/${config.maxInvites} enviado.`);

                    // Pausa configurável + aleatoriedade
                    const pause = (config.delay * 1000) + (Math.random() * 800);
                    await sleep(pause);
                } catch (err) {
                    log('⚠️ Erro ao processar clique em um botão.');
                }
            }
        } else {
            log('⏳ Nenhum botão visível agora. Rolando para carregar mais...');
        }

        // Rolar para o fundo para carregar mais conteúdo
        modal.scrollTop = modal.scrollHeight;
        await sleep(2500); // Aguarda carregamento do FB

        if (modal.scrollHeight > lastHeight) {
            log('📜 Lista expandida com novos usuários.');
            lastHeight = modal.scrollHeight;
            scrollRetries = 0;
        } else {
            // Verifica se há spinner de carregamento ativado
            if (modal.querySelector('[role="progressbar"]')) {
                log('⏳ Facebook está carregando dados...');
                await sleep(3000);
                continue;
            }

            scrollRetries++;
            if (scrollRetries >= 3) {
                log('🏁 Fim da lista atingido ou sem novos botões.');
                break;
            }

            // Tenta "balançar" o scroll para forçar carregamento
            log('🔄 Tentativa de carregar mais...');
            modal.scrollTop -= 300;
            await sleep(800);
            modal.scrollTop = modal.scrollHeight;
        }
    }

    log(`🏁 Processo concluído. Total de convites nesta sessão: ${totalInvited}`);
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

    // Ação Iniciar
    btnStart.addEventListener('click', async () => {
        if (dailyTotal >= DAILY_MAX) {
            addLog("🚫 Limite diário de 1050 atingido.");
            return;
        }

        btnStart.disabled = true;
        invitedSession = 0;
        statTotal.textContent = "0";
        statStatus.textContent = 'Processando...';
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
                addLog('🏁 Ciclo finalizado!');
            } else {
                addLog('Simulação: Modo Dev.');
                for (let i = 0; i < 3; i++) {
                    await new Promise(r => setTimeout(r, 1000));
                    invitedSession++; dailyTotal++;
                    statTotal.textContent = invitedSession;
                    updateDailyDisplay();
                }
            }
        } catch (err) {
            addLog('❌ Erro: ' + err.message);
        } finally {
            btnStart.disabled = false;
            statStatus.textContent = 'Aguardando';
        }
    });

    // Navegação
    btnSettings.addEventListener('click', () => { mainView.classList.add('hidden'); settingsView.classList.remove('hidden'); });
    btnBack.addEventListener('click', () => { settingsView.classList.add('hidden'); mainView.classList.remove('hidden'); });
});
