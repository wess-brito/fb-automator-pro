
import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Play,
  Facebook,
  Users,
  Settings,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  MousePointer2,
  LogOut,
  X,
  ScrollText,
  Download,
  ChevronLeft
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

declare const chrome: any;

const FB_INVITE_SCRIPT = async (config: { maxInvites: number; delay: number }) => {
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const log = (msg: string) => { try { chrome.runtime.sendMessage({ type: 'LOG', message: msg }); } catch (e) { } };
  const notifySuccess = () => { try { chrome.runtime.sendMessage({ type: 'INVITE_SUCCESS' }); } catch (e) { } };

  const findScrollableModal = () => {
    const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]'));
    if (dialogs.length === 0) return null;

    const reactionDialog = dialogs.find(dialog => {
      const hasInviteBtn = dialog.querySelector('div[aria-label*="onvidar"], div[aria-label*="nvite"], div[role="button"]');
      if (!hasInviteBtn) return false;
      const text = (hasInviteBtn as HTMLElement).innerText?.toLowerCase() || "";
      return text.includes("convidar") || text.includes("invite");
    });

    const target = reactionDialog || dialogs[dialogs.length - 1];

    const allDivs = Array.from(target.querySelectorAll('div'));
    const scrollables = allDivs.filter(el => {
      const style = window.getComputedStyle(el);
      return (style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
    });
    const bestScrollable = scrollables.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
    return bestScrollable || (target as HTMLElement);
  };

  const triggerClick = async (el: HTMLElement) => {
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

  const getInviteButtons = (container: Element) => {
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
      const hText = (el as HTMLElement).innerText?.trim().toLowerCase() || el.getAttribute('aria-label')?.trim().toLowerCase() || '';
      const isInvite = hText.includes('convidar') || hText.includes('invite');
      const isDone = hText.includes('convidado') || hText.includes('invited') ||
        hText.includes('enviado') || hText.includes('sent') ||
        hText.includes('pendente') || hText.includes('pending');
      return isInvite && !isDone && (el as HTMLElement).offsetParent !== null;
    }) as HTMLElement[];
  };

  const modal = findScrollableModal();
  if (!modal) {
    log("❌ Falha: Modal de reações não encontrado.");
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
          btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await sleep(600);

          await triggerClick(btn);
          totalInvited++;
          notifySuccess();
          log(`✅ Convite ${totalInvited}/${config.maxInvites} enviado.`);

          const pause = (config.delay * 1000) + (Math.random() * 800);
          await sleep(pause);
        } catch (e) {
          log("⚠️ Erro ao processar clique.");
        }
      }
      scrollRetries = 0;
    } else {
      log("⏳ Nenhum botão visível. Rolando...");
    }

    modal.scrollTop = modal.scrollHeight;
    await sleep(2500);

    if (modal.scrollHeight > lastHeight) {
      log("📜 Lista expandida.");
      lastHeight = modal.scrollHeight;
      scrollRetries = 0;
    } else {
      if (modal.querySelector('[role="progressbar"]')) {
        log("⏳ Carregando dados do Facebook...");
        await sleep(3000);
        continue;
      }

      scrollRetries++;
      if (scrollRetries >= 3) {
        log("🏁 Fim da lista atingido.");
        break;
      }
      log("🔄 Tentativa de carregar mais...");
      modal.scrollTop -= 300;
      await sleep(800);
      modal.scrollTop = modal.scrollHeight;
    }
  }

  log(`🏁 Processo concluído. Total: ${totalInvited}`);
  return totalInvited;
};

const App: React.FC = () => {
  const [view, setView] = useState<'main' | 'settings'>('main');
  const [status, setStatus] = useState<'idle' | 'running' | 'success'>('idle');
  const [log, setLog] = useState<string[]>([]);
  const [isOnFacebook, setIsOnFacebook] = useState(false);
  const [invitedTotal, setInvitedTotal] = useState(0); // Convites da sessão atual

  // Configurações
  const [inviteLimit, setInviteLimit] = useState(1000);
  const [delayTime, setDelayTime] = useState(2);
  const [dailyCount, setDailyCount] = useState(0); // Convites totais em 24h
  const [lastReset, setLastReset] = useState(Date.now());

  const DAILY_MAX = 1050;

  useEffect(() => {
    // Carregar configurações salvas
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(['inviteLimit', 'delayTime', 'dailyCount', 'lastReset'], (res: any) => {
        if (res.inviteLimit) setInviteLimit(res.inviteLimit);
        if (res.delayTime) setDelayTime(res.delayTime);

        const now = Date.now();
        if (res.lastReset && now - res.lastReset < 24 * 60 * 60 * 1000) {
          setDailyCount(res.dailyCount || 0);
          setLastReset(res.lastReset);
        } else {
          setDailyCount(0);
          setLastReset(now);
          chrome.storage.local.set({ dailyCount: 0, lastReset: now });
        }
      });
    }

    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.runtime) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => {
        setIsOnFacebook(tabs[0]?.url?.includes('facebook.com') || false);
      });

      const messageListener = (request: any) => {
        if (request.type === 'LOG') addLog(request.message);
        if (request.type === 'INVITE_SUCCESS') {
          setInvitedTotal(prev => prev + 1);
          setDailyCount(prev => {
            const next = prev + 1;
            chrome.storage.local.set({ dailyCount: next });
            return next;
          });
        }
      };

      chrome.runtime.onMessage.addListener(messageListener);
      return () => chrome.runtime.onMessage.removeListener(messageListener);
    } else {
      setIsOnFacebook(true);
    }
  }, []);

  const addLog = (msg: string) => {
    setLog(prev => [`[${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}] ${msg}`, ...prev].slice(0, 15));
  };

  const saveSettings = (limit: number, delay: number) => {
    setInviteLimit(limit);
    setDelayTime(delay);
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ inviteLimit: limit, delayTime: delay });
    }
  };

  const handleRun = async () => {
    if (!isOnFacebook || status === 'running') return;

    if (dailyCount >= DAILY_MAX) {
      addLog("🚫 Limite diário de 1050 atingido. Tente amanhã.");
      return;
    }

    setStatus('running');
    setInvitedTotal(0);
    addLog('🚀 Iniciando motor...');

    try {
      if (typeof chrome !== 'undefined' && chrome.scripting) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        // Ajustar limite para não passar do diário
        const allowed = Math.min(inviteLimit, DAILY_MAX - dailyCount);

        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: FB_INVITE_SCRIPT,
          args: [{ maxInvites: allowed, delay: delayTime }]
        });

        addLog("🏁 Ciclo finalizado!");
      } else {
        addLog("Simulação: Convites ativos...");
        for (let i = 0; i < 5; i++) {
          await new Promise(r => setTimeout(r, delayTime * 1000));
          setInvitedTotal(p => p + 1);
          setDailyCount(p => p + 1);
        }
        addLog("🏁 Simulação concluída.");
      }
      setStatus('success');
      setTimeout(() => setStatus('idle'), 2000);
    } catch (e: any) {
      addLog("❌ Erro: " + e.message);
      setStatus('idle');
    }
  };

  if (view === 'settings') {
    return (
      <div className="w-[400px] h-[600px] bg-white flex flex-col animate-in fade-in duration-300">
        <header className="bg-slate-900 p-5 text-white flex items-center gap-4">
          <button onClick={() => setView('main')} className="hover:bg-white/10 p-1 rounded-full transition-colors">
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-lg font-bold">Configurações</h1>
        </header>
        <main className="p-6 space-y-6 overflow-y-auto">
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Settings size={18} className="text-blue-500" /> Parâmetros de Automação
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Limite de Convites (Sessão)</label>
                <input
                  type="number"
                  value={inviteLimit}
                  onChange={(e) => saveSettings(Number(e.target.value), delayTime)}
                  className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:border-blue-500 transition-all"
                  min="1"
                  max="1050"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Pausa entre Convites ({delayTime}s)</label>
                <select
                  value={delayTime}
                  onChange={(e) => saveSettings(inviteLimit, Number(e.target.value))}
                  className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:border-blue-500 transition-all appearance-none"
                >
                  <option value={1}>1 Segundo</option>
                  <option value={2}>2 Segundos</option>
                  <option value={3}>3 Segundos</option>
                  <option value={4}>4 Segundos</option>
                  <option value={5}>5 Segundos</option>
                </select>
              </div>
            </div>

            <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
              <p className="text-[10px] text-blue-700 leading-tight font-medium">
                <strong>Limite de Segurança:</strong> A extensão é travada em {DAILY_MAX} convites a cada 24h para proteger sua conta.
              </p>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-100 space-y-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              Utilitários
            </h3>
            <button
              onClick={() => { setLog([]); }}
              className="w-full py-3 text-slate-400 font-bold text-xs flex items-center justify-center gap-2 hover:text-red-500 transition-colors"
            >
              <LogOut size={14} /> Limpar Logs
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="w-[400px] h-[600px] bg-white text-slate-900 font-sans flex flex-col shadow-2xl">
      <header className="bg-[#1877F2] p-5 text-white flex items-center justify-between shadow-lg z-10">
        <div className="flex items-center gap-3">
          <div className="bg-white/20 p-2 rounded-lg"><Facebook size={24} fill="white" stroke="none" /></div>
          <div><h1 className="text-lg font-bold leading-tight">FB Automator</h1><p className="text-[10px] text-blue-100 font-medium tracking-wider">PAGES PRO EDITION</p></div>
        </div>
        <button onClick={() => setView('settings')} className="p-2 hover:bg-white/10 rounded-full transition-colors">
          <Settings size={20} className="opacity-80" />
        </button>
      </header>

      <main className="flex-1 p-5 overflow-y-auto space-y-6 bg-slate-50/50">
        <div className={`flex items-center gap-3 p-4 rounded-2xl border transition-all ${isOnFacebook ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {isOnFacebook ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <p className="text-xs font-bold">{isOnFacebook ? 'Facebook Pronto' : 'Acesse o Facebook'}</p>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-50 text-[#1877F2] rounded-2xl"><Users size={20} /></div>
              <div><h3 className="font-bold text-slate-800">Convidar Reações</h3><p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Smart-Scroll Ativo</p></div>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold text-slate-400 uppercase">24h Limit</p>
              <p className={`text-xs font-black ${dailyCount >= DAILY_MAX ? 'text-red-500' : 'text-slate-600'}`}>{dailyCount}/{DAILY_MAX}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Convites Sessão</p>
              <p className="text-2xl font-black text-[#1877F2] leading-none">{invitedTotal}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Status</p>
              <p className="text-xs font-bold text-slate-600 truncate">{status === 'running' ? 'Trabalhando...' : 'Aguardando'}</p>
            </div>
          </div>

          <button
            onClick={handleRun}
            disabled={status === 'running' || !isOnFacebook || dailyCount >= DAILY_MAX}
            className={`w-full py-4 rounded-2xl font-bold text-sm shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2 ${status === 'running' ? 'bg-slate-100 text-slate-400' : 'bg-[#1877F2] hover:bg-[#1565D8] text-white disabled:opacity-50'}`}
          >
            {status === 'running' ? <Loader2 className="animate-spin" size={18} /> : <Play size={16} fill="white" />}
            {status === 'running' ? 'Processando Convites...' : 'Iniciar Automação'}
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between px-1"><span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Logs de Atividade</span></div>
          <div className="bg-slate-900 rounded-2xl p-4 h-40 overflow-y-auto font-mono text-[10px] text-blue-300 space-y-2 border border-slate-800">
            {log.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-2">
                <ScrollText size={20} />
                <span>Nenhuma atividade registrada</span>
              </div>
            ) : log.map((e, i) => (
              <div key={i} className={`animate-in slide-in-from-left-2 duration-300 ${e.includes('❌') || e.includes('🚫') ? 'text-red-400' : e.includes('✅') ? 'text-green-400' : ''}`}>
                {e}
              </div>
            ))}
          </div>
        </div>
      </main>
      <footer className="p-4 bg-white border-t border-slate-100 text-center flex items-center justify-center gap-4">
        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">FB Automator v1.1.0</p>
      </footer>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
