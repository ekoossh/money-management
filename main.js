
// ═══════ CUSTOM SELECT LOGIC ═══════
const renderCustomSelect = (id, options, selectedVal, className = 'add-input', styles = '') => {
    let selectedLabel = '';
    let optsHtml = '';
    options.forEach(o => {
        const isSel = (o.val == selectedVal);
        if (isSel) selectedLabel = o.label;
        optsHtml += `<div class="custom-option ${isSel ? 'selected' : ''}" data-value="${o.val}">${o.label}</div>`;
    });
    if (!selectedLabel && options.length > 0) {
        selectedLabel = options[0].label;
        selectedVal = options[0].val;
        optsHtml = optsHtml.replace('class="custom-option "', 'class="custom-option selected "');
    }
    return `
        <div class="custom-select" style="${styles}">
            <input type="hidden" id="${id}" value="${selectedVal}">
            <div class="custom-select-trigger ${className}" style="display:flex; justify-content:space-between; align-items:center; width:100%; font-size:inherit;">
                <span class="custom-select-text" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:inline-block; max-width:85%; font-size:inherit;">${selectedLabel}</span>
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="var(--text-3)" stroke-width="2" fill="none" style="flex-shrink:0; margin-left:4px;"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
            </div>
            <div class="custom-select-options">
                ${optsHtml}
            </div>
        </div>
    `;
};

document.addEventListener('click', e => {
    const trigger = e.target.closest('.custom-select-trigger');
    if (trigger) {
        const wrapper = trigger.closest('.custom-select');
        document.querySelectorAll('.custom-select.open').forEach(el => {
            if (el !== wrapper) el.classList.remove('open');
        });
        wrapper.classList.toggle('open');
        e.stopPropagation();
        return;
    }
    
    const opt = e.target.closest('.custom-option');
    if (opt) {
        const wrapper = opt.closest('.custom-select');
        const hidden = wrapper.querySelector('input[type="hidden"]');
        const text = wrapper.querySelector('.custom-select-text');
        
        hidden.value = opt.dataset.value;
        text.textContent = opt.textContent;
        
        wrapper.classList.remove('open');
        wrapper.querySelectorAll('.custom-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        
        // Trigger specific logic
        if (hidden.id.startsWith('fr-type-') && window.toggleFilterType) window.toggleFilterType(hidden.id.split('-')[2]);
        
        e.stopPropagation();
        return;
    }
    
    document.querySelectorAll('.custom-select.open').forEach(el => el.classList.remove('open'));
});

const API_URL = 'https://script.google.com/macros/s/AKfycbwyzGBjmtaQcAwtt249HgMm2SaNCM8h5peZ2aXQWLGViP4QiScyBYzHHN1X6JA0UadO/exec';
'use strict';

document.addEventListener('DOMContentLoaded', () => {

/* ── Defaults ─────────────────────────────────────── */
const DEFAULTS = { equity: 50_000_000, rpt: 0.50, feeBuy: 0.15, feeSell: 0.25, rrRatio: 2.0 };

/* ── State ────────────────────────────────────────── */
let cfg = { ...DEFAULTS };
cfg.telegramToken = localStorage.getItem('mm_tg_token') || '';
cfg.telegramChatId = localStorage.getItem('mm_tg_chatid') || '';
if (cfg.rrRatio === undefined) cfg.rrRatio = DEFAULTS.rrRatio;
let list = [];
let stockPrices = {};
let sortCol = null;
let sortDir = 'asc';
let activeFilters = new Set(['order', 'running']);

const getPin = () => {
    let pin = localStorage.getItem('mm_pin');
    if (!pin) {
        pin = prompt('Masukkan PIN Rahasia Anda:');
        if (pin) localStorage.setItem('mm_pin', pin);
    }
    return pin || '';
};


/* ── Helpers ──────────────────────────────────────── */
const $  = id => document.getElementById(id);
const q  = (sel, root = document) => root.querySelector(sel);
const qa = (sel, root = document) => root.querySelectorAll(sel);

const fmtIDR = v => {
    if (v === '' || v == null || isNaN(v)) return '—';
    return new Intl.NumberFormat('id-ID').format(Math.round(v));
};
const parseIDR = s => parseFloat(String(s).replace(/\./g,'').replace(',','.')) || 0;
const fmtPct  = v => v == null || isNaN(v) ? '—' : (v * 100).toFixed(2) + '%';

const nomRisk = () => cfg.equity * (cfg.rpt / 100);

const getStats = () => {
    let tpProfit = 0;
    let slLoss = 0;
    let totalRealizedRisk = 0;
    let realizedCount = 0;
    let pctSum = 0;
    let pctCount = 0;
    
    list.forEach(r => {
        const hb = parseFloat(r.hargaBuy);
        const sl = parseFloat(r.stopLoss);
        
        if (hb && sl && hb > sl) {
            pctSum += (hb - sl) / hb;
            pctCount++;
            const buyFee = hb * (1 + cfg.feeBuy / 100);
            const slFee = sl * (1 - cfg.feeSell / 100);
            const rangeFee = buyFee - slFee;
            if (rangeFee > 0) {
                const currentRisk = nomRisk();
                const lot = Math.round((currentRisk / rangeFee) / 100);
                
                if (lot > 0) {
                    const actualRisk = lot * 100 * rangeFee;
                    if (r.status === 'tp' || r.status === 'sl') {
                        totalRealizedRisk += actualRisk;
                        realizedCount++;
                        if (r.status === 'tp') {
                            tpProfit += actualRisk * cfg.rrRatio;
                        } else if (r.status === 'sl') {
                            slLoss += actualRisk;
                        }
                    }
                }
            }
        }
    });
    
    const avgRealizedRisk = realizedCount > 0 ? totalRealizedRisk / realizedCount : 0;
    const avgRange = pctCount > 0 ? pctSum / pctCount : 0;
    
    return { currentEquity: cfg.equity + tpProfit - slLoss, tpProfit, slLoss, avgRealizedRisk, avgRange };
};

const calcRow = (hb, sl) => {
    hb = parseFloat(hb); sl = parseFloat(sl);
    if (!hb || !sl || hb <= 0 || sl <= 0) return { ok: false, invSL: false };
    if (sl >= hb) return { ok: false, invSL: true };
    const fb = cfg.feeBuy  / 100;
    const fs = cfg.feeSell / 100;
    const buyFee  = hb * (1 + fb);
    const slFee   = sl * (1 - fs);
    const rangeFee = buyFee - slFee;
    if (rangeFee <= 0) return { ok: false, invSL: true };
    const pct = (hb - sl) / hb;
    const lot = Math.round((nomRisk() / rangeFee) / 100);
    const nom = lot * 100 * buyFee;
    return { ok: true, invSL: false, pct, lot, nom };
};

const save = async () => {
    if (!cfg.telegramToken) cfg.telegramToken = localStorage.getItem('mm_tg_token') || '';
    if (!cfg.telegramChatId) cfg.telegramChatId = localStorage.getItem('mm_tg_chatid') || '';
    cfg.screenerCustomPresets = window.screenerCustomPresets || {};
    toast('Menyimpan ' + list.length + ' baris...', 'info');
    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({cfg, list, watchList: window.wList || [], pin: getPin()})
        });
        const out = await res.json();
        if(out.status === 'success') toast('Tersimpan ✓');
        else toast('Gagal: ' + out.message, 'err');
    } catch(err) {
        toast('Gagal: ' + err.message, 'err');
    }
};

/* ── Toast ────────────────────────────────────────── */
let _tt;
const ICONS = {
    ok:   `<svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>`,
    err:  `<svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>`,
    info: `<svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
};
const ICON_COLORS = { ok: '#a3e635', err: '#f87171', info: '#60a5fa' };

const toast = (msg, type = 'ok') => {
    const el  = $('toast');
    const ico = $('toast-icon');
    $('toast-msg').textContent = msg;
    ico.innerHTML  = ICONS[type] || ICONS.ok;
    ico.style.color = ICON_COLORS[type] || ICON_COLORS.ok;
    el.classList.add('show');
    clearTimeout(_tt);
    _tt = setTimeout(() => el.classList.remove('show'), 3200);
};

/* ── Confirm Modal ────────────────────────────────── */
const confirm = (title, body) => new Promise(res => {
    const bd = $('modal-backdrop');
    $('modal-title').textContent = title;
    $('modal-body').textContent  = body;
    bd.classList.remove('hidden');
    const ok = () => { bd.classList.add('hidden'); res(true);  cleanup(); };
    const no = () => { bd.classList.add('hidden'); res(false); cleanup(); };
    const cleanup = () => {
        $('modal-confirm').onclick = null;
        $('modal-cancel').onclick  = null;
        bd.onclick = null;
    };
    $('modal-confirm').onclick = ok;
    $('modal-cancel').onclick  = no;
    bd.onclick = e => { if (e.target === bd) no(); };
});

/* ── Navigation ───────────────────────────────────── */
const PAGE = {
    dashboard: { title: 'Dashboard',  sub: 'Ringkasan trading kamu hari ini' },
    tradeplan: { title: 'Trade Plan',  sub: 'Kelola dan kalkulasi setup breakout Anda' },
    settings:  { title: 'Settings',   sub: 'Konfigurasi equity, risiko, dan fee' },
    screener:  { title: 'Screener',   sub: 'Cari saham potensial dari TradingView' },
    watchlist: { title: 'Watchlist',  sub: 'Pantau kandidat saham pilihanmu' },
};

let currentSection = 'tradeplan';

const navigate = target => {
    currentSection = target;
    qa('.section').forEach(s => s.classList.add('hidden'));
    $(target)?.classList.remove('hidden');

    qa('.nav-item').forEach(a => {
        const isMe = a.dataset.section === target;
        a.classList.toggle('active', isMe);
    });

    const m = PAGE[target] || {};
    $('page-title').textContent = m.title || '';
    $('page-sub').textContent   = m.sub   || '';

    const btnAdd = $('btn-add');
    if (btnAdd) {
        btnAdd.style.display = (target === 'tradeplan') ? 'flex' : 'none';
    }
    
    // Auto-Scan logic
    if (target === 'screener') {
        if (cfg.screenerAutoScan && window.screenerCustomPresets && window.screenerCustomPresets[cfg.screenerAutoScan]) {
            if (window.loadCustomPreset) window.loadCustomPreset(cfg.screenerAutoScan);
            window.currentScreenerPreset = 'custom';
            document.querySelectorAll('#screener-filter-bar .filter-chip').forEach(c => c.classList.remove('active'));
            const customChip = document.querySelector('#screener-filter-bar .filter-chip'); // The first one is Custom
            if (customChip && customChip.textContent === 'Custom') customChip.classList.add('active');
            
            if (window.runScreener) {
                // Short delay to let UI settle
                setTimeout(() => window.runScreener(), 100);
            }
        }
    }

    closeSidebar();
};

const closeSidebar = () => {
    $('sidebar').classList.remove('open');
    $('sidebar-overlay').classList.remove('visible');
};

qa('.nav-item').forEach(a => {
    a.addEventListener('click', e => { e.preventDefault(); navigate(a.dataset.section); });
});

$('menu-btn').addEventListener('click', () => {
    if (window.innerWidth > 768) {
        $('sidebar').classList.toggle('collapsed');
        q('.main').classList.toggle('expanded');
    } else {
        const open = $('sidebar').classList.toggle('open');
        $('sidebar-overlay').classList.toggle('visible', open);
    }
});
$('sidebar-overlay').addEventListener('click', closeSidebar);

/* ── Dashboard ────────────────────────────────────── */
const updDash = () => {
    const stats = getStats();
    
    $('dash-equity').textContent     = fmtIDR(stats.currentEquity);
    $('dash-avg-range').textContent  = stats.avgRange > 0 ? fmtPct(stats.avgRange) : '—';
    $('dash-fee-buy').textContent    = Number(cfg.feeBuy).toFixed(2);
    $('dash-fee-sell').textContent   = Number(cfg.feeSell).toFixed(2);
    $('dash-nominal-risk').textContent = 'Rp ' + fmtIDR(stats.avgRealizedRisk);

    const totalItems = list.length;
    const orderCount = list.filter(r => r.status === 'order').length;
    const filled = list.filter(r => r.status === 'running').length;
    const activeTotal = filled + orderCount;

    $('dash-filled').textContent      = filled;
    $('dash-total').textContent       = activeTotal;
    $('dash-empty-slots').textContent = activeTotal - filled;
    $('dash-total-saham').textContent = totalItems;
    $('slots-progress').style.width   = activeTotal ? `${(filled/activeTotal)*100}%` : '0%';

    // Sync settings fields
    $('set-equity').value   = fmtIDR(cfg.equity);
    $('set-rpt').value      = cfg.rpt;
    $('set-rr').value       = cfg.rrRatio || 2;
    $('set-fee-buy').value  = cfg.feeBuy;
    $('set-fee-sell').value = cfg.feeSell;
    if ($('set-tg-token') && document.activeElement !== $('set-tg-token')) {
        $('set-tg-token').value = cfg.telegramToken || '';
    }
    if ($('set-tg-chatid') && document.activeElement !== $('set-tg-chatid')) {
        $('set-tg-chatid').value = cfg.telegramChatId || '';
    }
    
    // Average Time Stats
    let tpTimes = [], slTimes = [];
    list.forEach(r => {
        if (r.history && r.history.running) {
            if (r.status === 'tp' && r.history.tp) {
                tpTimes.push(r.history.tp - r.history.running);
            } else if (r.status === 'sl' && r.history.sl) {
                slTimes.push(r.history.sl - r.history.running);
            }
        }
    });
    
    const formatDuration = (ms) => {
        if (ms <= 0) return '0 hari';
        const days = Math.round(ms / (1000 * 60 * 60 * 24));
        return `${days} hari`;
    };
    
    const avgTp = tpTimes.length ? tpTimes.reduce((a,b) => a+b, 0) / tpTimes.length : 0;
    const avgSl = slTimes.length ? slTimes.reduce((a,b) => a+b, 0) / slTimes.length : 0;
    
    $('dash-avg-tp').textContent = tpTimes.length ? formatDuration(avgTp) : '—';
    $('dash-avg-sl').textContent = slTimes.length ? formatDuration(avgSl) : '—';
    
    // Trade Plan Mini Dashboard Sync
    if ($('wl-dash-equity')) {
        $('wl-dash-equity').textContent       = fmtIDR(stats.currentEquity);
        $('wl-dash-avg-range').textContent    = stats.avgRange > 0 ? fmtPct(stats.avgRange) : '—';
        $('wl-dash-nominal-risk').textContent = 'Rp ' + fmtIDR(stats.avgRealizedRisk);
        $('wl-dash-aktif').textContent        = `${filled}/${activeTotal}`;
        $('wl-dash-avg-tp').textContent       = tpTimes.length ? formatDuration(avgTp) : '—';
        $('wl-dash-avg-sl').textContent       = slTimes.length ? formatDuration(avgSl) : '—';
    }
};

/* ── Settings ─────────────────────────────────────── */
$('btn-reset-pin')?.addEventListener('click', () => {
    localStorage.removeItem('mm_pin');
    alert('PIN berhasil dihapus. Halaman akan dimuat ulang.');
    location.reload();
});

$('btn-save-settings').addEventListener('click', () => {
    const eq = parseIDR($('set-equity').value) || parseFloat($('set-equity').value);
    const rpt = parseFloat($('set-rpt').value);
    const rr  = parseFloat($('set-rr').value);
    const fb  = parseFloat($('set-fee-buy').value);
    const fs  = parseFloat($('set-fee-sell').value);
    if (eq  > 0) cfg.equity  = eq;
    if (rpt > 0) cfg.rpt     = rpt;
    if (rr  > 0) cfg.rrRatio = rr;
    if (fb >= 0) cfg.feeBuy  = fb;
    if (fs >= 0) cfg.feeSell = fs;
    if ($('set-tg-token')) {
        cfg.telegramToken = $('set-tg-token').value.trim();
        localStorage.setItem('mm_tg_token', cfg.telegramToken);
    }
    if ($('set-tg-chatid')) {
        cfg.telegramChatId = $('set-tg-chatid').value.trim();
        localStorage.setItem('mm_tg_chatid', cfg.telegramChatId);
    }
    save(); updDash(); renderTable();
    toast('Pengaturan tersimpan ✓');
    if (cfg.telegramToken) {
        fetch(`${API_URL}?pin=${encodeURIComponent(getPin())}&action=setWebhook`).catch(()=>{});
    }
});

$('btn-reset-all').addEventListener('click', async () => {
    const ok = await confirm('Reset Semua Data', 'Semua trade plan dan pengaturan akan dihapus. Tindakan ini permanen.');
    if (!ok) return;
    cfg = { ...DEFAULTS }; list = [];
    save(); updDash(); renderTable();
    toast('Data direset', 'info');
});

/* ── Status config ───────────────────────────────── */
const STATUS_LIST = ['order','running','canceled','tp','sl'];
const STATUS_LABEL = { order:'Order Limit', running:'Running', canceled:'Canceled', tp:'Hit TP', sl:'Hit SL' };

const makeBadge = (status) => {
    const s = status || 'order';
    return `<span class="badge badge-${s}">${STATUS_LABEL[s] || s}</span>`;
};

const makeDropdown = (idx, current) => {
    const s = current || 'order';
    const opts = STATUS_LIST.map(v =>
        `<button class="status-opt status-opt--${v} ${v === s ? 'selected' : ''}" data-status="${v}">${STATUS_LABEL[v]}</button>`
    ).join('');
    return `<div class="status-dropdown hidden" data-for="${idx}">${opts}</div>`;
};

/* Close all open dropdowns */
const closeAllDropdowns = () => {
    document.querySelectorAll('.status-dropdown').forEach(d => {
        d.classList.add('hidden');
        d.style.position = '';
        d.style.top = '';
        d.style.left = '';
    });
};
document.addEventListener('click', e => {
    if (!e.target.closest('.status-cell')) closeAllDropdowns();
});
document.querySelector('.content').addEventListener('scroll', closeAllDropdowns);


/* ── Live Prices & Auto Triggers (Yahoo Finance API) ── */
const fetchPrices = async (codes) => {
    if (!codes || !codes.length) return {};
    const results = {};
    const uniqueCodes = [...new Set(codes.map(c => c.trim().toUpperCase()).filter(Boolean))];
    
    // Method 1: Fetch via Google Apps Script Backend (super fast, no CORS restriction)
    const pin = getPin();
    if (API_URL && API_URL.startsWith('http')) {
        try {
            const resp = await fetch(`${API_URL}?pin=${encodeURIComponent(pin)}&action=fetchPrices&tickers=${encodeURIComponent(uniqueCodes.join(','))}`);
            if (resp.ok) {
                const data = await resp.json();
                if (data && data.prices && Object.keys(data.prices).length > 0) {
                    return data.prices;
                }
            }
        } catch(e) {
            console.warn('Backend price fetch error, falling back to direct Yahoo fetch:', e);
        }
    }

    // Method 2: Fallback Direct / Proxy Fetch for Yahoo Finance
    const fetchPromises = uniqueCodes.map(async (code) => {
        const yTicker = code.includes('.') ? code : code + '.JK';
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yTicker}?interval=1d&range=1d`;
        try {
            let resp = await fetch(url).catch(() => null);
            if (!resp || !resp.ok) {
                const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
                resp = await fetch(proxyUrl).catch(() => null);
            }
            if (resp && resp.ok) {
                const data = await resp.json();
                if (data?.chart?.result?.[0]?.meta) {
                    const meta = data.chart.result[0].meta;
                    const price = meta.regularMarketPrice || 0;
                    const high = meta.regularMarketDayHigh || price;
                    const low = meta.regularMarketDayLow || price;
                    const prev = meta.chartPreviousClose || price;
                    const changePct = prev > 0 ? ((price - prev) / prev) * 100 : 0;
                    results[code] = { price, high, low, prev, changePct };
                }
            }
        } catch(err) {
            console.warn(`Failed fetching price for ${code}`, err);
        }
    });

    await Promise.all(fetchPromises);
    return results;
};

const checkAutoTriggers = (prices) => {
    if (!list || !list.length || !prices) return false;
    let changed = false;

    list.forEach((row) => {
        const code = (row.stockCode || '').toUpperCase();
        const pData = prices[code];
        if (!pData) return;

        const status = row.status || 'order';
        const buyPrice = parseFloat(row.hargaBuy) || 0;
        const slPrice  = parseFloat(row.stopLoss) || 0;
        const c = calcRow(row.hargaBuy, row.stopLoss);
        const tpPrice  = c.ok ? c.tp : 0;

        const dayLow  = pData.low  > 0 ? pData.low  : pData.price;
        const dayHigh = pData.high > 0 ? pData.high : pData.price;

        const now = Date.now();


    });

    return changed;
};

let isSyncingPrices = false;

const syncPricesAndTriggers = async (showToast = false) => {
    if (isSyncingPrices || !list || !list.length) return;
    isSyncingPrices = true;

        const refBtn = $('refresh-btn');
        if (refBtn) refBtn.classList.add('syncing');

    const codes = list.map(r => r.stockCode).filter(Boolean);
    const newPrices = await fetchPrices(codes);

    if (Object.keys(newPrices).length > 0) {
        stockPrices = { ...stockPrices, ...newPrices };
        const triggered = checkAutoTriggers(stockPrices);
        if (triggered) {
            save();
            updDash();
        }
        renderTable();
        if (showToast) toast('Harga live & trigger saham diperbarui ✓', 'info');
    } else if (showToast) {
        toast('Gagal mengambil data harga live', 'err');
    }

        if (refBtn) refBtn.classList.remove('syncing');
    isSyncingPrices = false;
};


/* ── Render Table ─────────────────────────────────── */
const renderTable = () => {
    // Clean up any dropdowns that were moved to body
    document.querySelectorAll('body > .status-dropdown').forEach(d => d.remove());
    
    const body = $('wl-body');
    body.innerHTML = '';

    // Count per-status for filter chips
    const counts = { order:0, running:0, canceled:0, tp:0, sl:0 };
    list.forEach(r => { const s = (r.status || 'order').toString().toLowerCase().trim(); if (counts[s] !== undefined) counts[s]++; });
    STATUS_LIST.forEach(s => {
        const el = $('fcc-' + s);
        if (el) el.textContent = counts[s];
        
        const chip = $(`fc-${s}`);
        if (chip) chip.classList.toggle('active', activeFilters.has(s));
    });

    // Sync "Semua" chip — active only when all statuses selected
    const allChip = $('fc-all');
    const allActive = activeFilters.size === STATUS_LIST.length;
    allChip.classList.toggle('active', allActive);

    // Filter list
    const isAll = activeFilters.size === 0 || allActive;
    let filtered = isAll ? [...list] : list.filter(r => activeFilters.has((r.status || 'order').toString().toLowerCase().trim()));

    // Helper to get timestamp for sorting
    const getTs = (r) => {
        if (typeof r.updatedAt === 'number') return r.updatedAt;
        let max = 0;
        if (r.history) {
            const vals = Object.values(r.history).filter(v => typeof v === 'number');
            if (vals.length) max = Math.max(...vals);
        }
        if (!max && r.id) max = Number(r.id) || 0;
        return max || (list.length - list.indexOf(r));
    };

    // Sorting logic (manual sort by column or default timestamp sort)
    if (sortCol) {
        filtered.sort((a, b) => {
            let valA, valB;
            if (sortCol === 'no') {
                valA = getTs(a);
                valB = getTs(b);
                return sortDir === 'asc' ? (valB - valA) : (valA - valB);
            } else if (sortCol === 'code') {
                valA = (a.stockCode || '').toUpperCase();
                valB = (b.stockCode || '').toUpperCase();
            } else if (sortCol === 'nominal') {
                const cA = calcRow(a.hargaBuy, a.stopLoss);
                const cB = calcRow(b.hargaBuy, b.stopLoss);
                valA = (cA.ok && cA.nom > 0) ? cA.nom : 0;
                valB = (cB.ok && cB.nom > 0) ? cB.nom : 0;
            } else if (sortCol === 'status') {
                valA = (a.status || 'order').toLowerCase();
                valB = (b.status || 'order').toLowerCase();
            }

            if (valA < valB) return sortDir === 'asc' ? -1 : 1;
            if (valA > valB) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
    } else {
        // Default sort by latest update
        filtered.sort((a, b) => getTs(b) - getTs(a));
    }

    // Update header sort indicator icons and classes
    qa('.wl-table thead th.sortable').forEach(th => {
        const key = th.dataset.sort;
        const icon = th.querySelector('.sort-icon');
        if (key === sortCol) {
            th.classList.add('sorted');
            if (icon) icon.textContent = sortDir === 'asc' ? '▲' : '▼';
        } else {
            th.classList.remove('sorted');
            if (icon) icon.textContent = '↕';
        }
    });

    $('wl-count-num').textContent = filtered.length;

    if (!filtered.length) {
        $('empty-state').classList.remove('hidden');
        return;
    }
    $('empty-state').classList.add('hidden');


    let totalLots = 0, totalNom = 0, pctSum = 0, pctCount = 0;

    filtered.forEach((row, i) => {
        // Find original index for state mutations
        const origIdx = list.indexOf(row);
        const c = calcRow(row.hargaBuy, row.stopLoss);
        if (c.ok) {
            totalLots += c.lot;
            totalNom  += c.nom;
            pctSum    += c.pct;
            pctCount++;
        }

        const pctStr = c.ok ? fmtPct(c.pct)                              : '—';
        const lotStr = c.ok && c.lot > 0 ? c.lot.toLocaleString('id-ID') : '—';
        const nomStr = c.ok && c.nom > 0 ? fmtIDR(c.nom) : '—';
        const rowStatus = (row.status || 'order').toString().toLowerCase().trim();

        const tr = document.createElement('tr');
        tr.dataset.idx = origIdx;
        tr.classList.add('clickable-row');
        tr.addEventListener('click', e => {
            if (e.target.closest('button, .status-cell, .action-group, .status-dropdown')) return;
            closeAllDropdowns();
            
            let historyItems = [];
            if (row.history) {
                for (const [s, ts] of Object.entries(row.history)) {
                    historyItems.push({ status: s, ts: ts });
                }
                historyItems.sort((a,b) => a.ts - b.ts);
            }
            if (historyItems.length === 0 && row.dateAdded) {
                 historyItems.push({ status: row.status || 'order', dateStr: row.dateAdded });
            }

            let tlHtml = '';
            if (historyItems.length === 0) {
                tlHtml = `<div class="empty-sub" style="margin:0;">Belum ada riwayat</div>`;
            } else {
                historyItems.forEach((item, j) => {
                    const isLast = (j === historyItems.length - 1);
                    let dateText = item.dateStr || new Date(item.ts).toLocaleString('id-ID', {
                        day: '2-digit', month: 'short', year: 'numeric', 
                        hour: '2-digit', minute: '2-digit'
                    });
                    tlHtml += `
                        <div class="tl-item">
                            <div class="tl-dot ${isLast ? 'active' : ''}"></div>
                            <div class="tl-content">
                                <div class="tl-title">${window.STATUS_LABEL ? window.STATUS_LABEL[item.status] : item.status}</div>
                                <div class="tl-date">${dateText}</div>
                            </div>
                        </div>
                    `;
                });
            }

            const modal = document.getElementById('row-action-modal');
            if (modal) {
                document.getElementById('ra-title').textContent = `Riwayat ${row.stockCode||''}`;
                document.getElementById('ra-content').innerHTML = `<div class="detail-timeline" style="padding-top:4px; padding-bottom:12px;">${tlHtml}</div>`;
                
                document.getElementById('ra-edit').dataset.i = origIdx;
                document.getElementById('ra-del').dataset.i = origIdx;
                
                modal.classList.remove('hidden');
                setTimeout(() => { modal.classList.add('visible'); }, 10);
            }
        });
        tr.innerHTML = `
            <td style="text-align:center; padding-left:20px; padding-right:4px; width:44px; color:var(--text-3); font-size:12px;">${i+1}</td>
            <td style="text-align:left;">
                <div class="tp-cell" style="align-items:flex-start;">
                    <div class="tp-val-top">${row.stockCode||'—'}</div>
                    <div class="tp-val-bot">
                        ${makeBadge(rowStatus)}
                    </div>
                </div>
            </td>
            <td>
                <div class="tp-cell">
                                        <div class="tp-val-top">${row.hargaBuy ? fmtIDR(row.hargaBuy) : '—'}</div>
                    ${(() => {
                        const cUpper = (row.stockCode || '').toUpperCase();
                        const pInfo = stockPrices[cUpper];
                        if (!pInfo) return '<div class="tp-val-bot">—</div>';
                        const chg = pInfo.changePct || 0;
                        const chgClass = chg > 0 ? ' up' : (chg < 0 ? ' down' : '');
                        const chgStr = chg > 0 ? ` (+${chg.toFixed(1)}%)` : (chg < 0 ? ` (${chg.toFixed(1)}%)` : '');
                        return `<div class="tp-val-bot${chgClass}">${fmtIDR(pInfo.price)}${chgStr}</div>`;
                    })()}
                </div>
            </td>
            <td>
                <div class="tp-cell">
                    <div class="tp-val-top">${row.stopLoss ? fmtIDR(row.stopLoss) : '—'}</div>
                    <div class="tp-val-bot">${pctStr}</div>
                </div>
            </td>
            <td style="padding-right: 20px;">
                <div class="tp-cell">
                    <div class="tp-val-top">${lotStr}</div>
                    <div class="tp-val-bot">${nomStr}</div>
                </div>
            </td>
`;
        body.appendChild(tr);

        });

    // Status dropdown toggle
    qa('.status-btn', body).forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const idx = btn.dataset.idx;
            const dd = document.querySelector(`.status-dropdown[data-for="${idx}"]`);
            if (!dd) return;
            const wasHidden = dd.classList.contains('hidden');
            closeAllDropdowns();
            if (wasHidden) {
                dd.classList.remove('hidden');
                
                // Move to body to escape ANY containing blocks (like CSS animations)
                document.body.appendChild(dd);
                
                // Calculate position to avoid table overflow clipping
                const rect = btn.getBoundingClientRect();
                const ddHeight = 160; // approximate height
                const spaceBelow = window.innerHeight - rect.bottom;
                
                dd.style.position = 'fixed';
                dd.style.left = (rect.left + rect.width / 2) + 'px';
                
                if (spaceBelow < ddHeight && rect.top > ddHeight) {
                    // Drop up if not enough space below
                    dd.style.top = (rect.top - ddHeight) + 'px';
                } else {
                    // Drop down
                    dd.style.top = (rect.bottom + 4) + 'px';
                }
            }
        });
    });

    // Status option selection
    qa('.status-opt', body).forEach(opt => {
        opt.addEventListener('click', e => {
            e.stopPropagation();
            const dd  = opt.closest('.status-dropdown');
            const idx = parseInt(dd.dataset.for);
            const val = opt.dataset.status;
            const oldStatus = list[idx].status || 'order';
            
            if (oldStatus !== val) {
                list[idx].status = val;
                const now = Date.now();
                list[idx].updatedAt = now;
                if (!list[idx].history) list[idx].history = {};
                list[idx].history[val] = now;
                if (val === 'running' && !list[idx].history.running) {
                    list[idx].history.running = now;
                }
                list[idx].dateAdded = new Date(now).toLocaleDateString('id-ID', {day:'2-digit', month:'short'});
            }
            
            save();
            closeAllDropdowns();
            renderTable();
            updDash();
        });
    });

    // Delete buttons
    qa('.del-btn', body).forEach(btn => {
        btn.addEventListener('click', async () => {
            const idx  = parseInt(btn.dataset.i);
            const code = list[idx]?.stockCode || `#${idx+1}`;
            const ok   = await confirm('Hapus Saham', `Hapus ${code} dari Trade Plan?`);
            if (!ok) return;
            list.splice(idx, 1);
            save(); renderTable(); updDash();
            toast(`${code} dihapus`);
        });
    });

    // Edit buttons
    qa('.edit-btn', body).forEach(btn => {
        btn.addEventListener('click', () => {
            const idx  = parseInt(btn.dataset.i);
            openAddPopup(idx);
        });
    });
};

/* ── Add/Edit Popup ────────────────────────────────────── */
let editModeIdx = -1;

const openAddPopup = (idx = -1) => {
    editModeIdx = idx;
    if (idx === -1) {
        $('ap-code').value = '';
        $('ap-buy').value  = '';
        $('ap-sl').value   = '';
        qa('.status-pill', $('ap-status-group')).forEach(p => p.classList.toggle('active', p.dataset.val === 'order'));
        q('.add-popup-title', $('add-popup')).textContent = 'Tambah Saham';
        q('.add-popup-sub', $('add-popup')).textContent = 'Masukkan data posisi baru';
        $('add-save').innerHTML = `<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/></svg> Tambah ke Trade Plan`;
    } else {
        const row = list[idx];
        $('ap-code').value = row.stockCode || '';
        $('ap-buy').value  = row.hargaBuy || '';
        $('ap-sl').value   = row.stopLoss || '';
        qa('.status-pill', $('ap-status-group')).forEach(p => p.classList.toggle('active', p.dataset.val === (row.status || 'order')));
        q('.add-popup-title', $('add-popup')).textContent = 'Edit Saham';
        q('.add-popup-sub', $('add-popup')).textContent = 'Ubah data posisi saham';
        $('add-save').innerHTML = `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg> Simpan Perubahan`;
    }
    updPreview();
    $('add-backdrop').classList.remove('hidden');
    setTimeout(() => $('ap-code').focus(), 80);
};

const closeAddPopup = () => {
    $('add-backdrop').classList.add('hidden');
};

const updPreview = () => {
    const hb = parseFloat($('ap-buy').value);
    const sl = parseFloat($('ap-sl').value);
    const c  = calcRow(hb, sl);
    const preview = $('add-preview');

    if (c.ok && c.lot > 0) {
        $('pv-range').textContent = fmtPct(c.pct);
        $('pv-lot').textContent   = c.lot.toLocaleString('id-ID');
        $('pv-nom').textContent   = 'Rp ' + fmtIDR(c.nom);
        preview.classList.remove('dim');
    } else {
        $('pv-range').textContent = '—';
        $('pv-lot').textContent   = '—';
        $('pv-nom').textContent   = '—';
        preview.classList.add('dim');
    }
};

const saveFromPopup = () => {
    const code   = $('ap-code').value.trim().toUpperCase();
    const hb     = $('ap-buy').value.trim();
    const sl     = $('ap-sl').value.trim();
    const active = q('.status-pill.active', $('ap-status-group'));
    const status = active ? active.dataset.val : 'order';
    const dateAdded = new Date().toLocaleDateString('id-ID', {day:'2-digit', month:'short'});

    if (!code) { $('ap-code').focus(); return; }

    if (editModeIdx > -1) {
        const row = list[editModeIdx];
        const oldStatus = row.status || 'order';
        row.stockCode = code;
        row.hargaBuy = hb;
        row.stopLoss = sl;
        row.updatedAt = Date.now();
        if (!row.history) row.history = {};
        row.history[status] = Date.now();
        if (oldStatus !== status) {
            row.status = status;
            const now = Date.now();
            if (!row.history) row.history = {};
            row.history[status] = now;
            if (status === 'running' && !row.history.running) {
                row.history.running = now;
            }
            row.dateAdded = new Date(now).toLocaleDateString('id-ID', {day:'2-digit', month:'short'});
        }
        toast(`${code} diperbarui ✓`);
    } else {
        const history = {};
        history[status] = Date.now();
        if (status === 'running' || status === 'tp' || status === 'sl') {
            history.running = Date.now(); // fallback for logic if added straight to running
        }
        list.push({ stockCode: code, hargaBuy: hb, stopLoss: sl, status, dateAdded, history });
        toast(`${code} ditambahkan ✓`);
    }
    
    save(); renderTable(); updDash();
    closeAddPopup();
};

// Status pill toggle in popup
$('ap-status-group').addEventListener('click', e => {
    const pill = e.target.closest('.status-pill');
    if (!pill) return;
    qa('.status-pill', $('ap-status-group')).forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
});

// Open
$('btn-add').addEventListener('click', () => openAddPopup(-1));

// Close
$('add-close').addEventListener('click',  closeAddPopup);
$('add-cancel').addEventListener('click', closeAddPopup);
$('add-backdrop').addEventListener('click', e => { if (e.target === $('add-backdrop')) closeAddPopup(); });

// Save
$('add-save').addEventListener('click', saveFromPopup);

// Live preview on input
['ap-buy','ap-sl'].forEach(id => $( id).addEventListener('input', updPreview));

// Enter key shortcuts
$('ap-code').addEventListener('keydown', e => { if (e.key === 'Enter') $('ap-buy').focus(); });
$('ap-buy').addEventListener('keydown',  e => { if (e.key === 'Enter') $('ap-sl').focus(); });
$('ap-sl').addEventListener('keydown',   e => { if (e.key === 'Enter') saveFromPopup(); });

// Esc to close
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        if (!$('add-backdrop').classList.contains('hidden')) closeAddPopup();
    }
});



/* ── Trade Plan Other Actions ──────────────────────── */

$('btn-clear').addEventListener('click', async () => {
    if (!list.length) { toast('Trade Plan sudah kosong', 'info'); return; }
    const ok = await confirm('Hapus Semua', `Hapus semua ${list.length} saham dari Trade Plan?`);
    if (!ok) return;
    list = []; save(); renderTable(); updDash();
    toast('Trade Plan dikosongkan', 'info');
});

/* ── Import ───────────────────────────────────────── */
$('btn-import').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async e => {
    if (!e.target.files.length) return;
    const file = e.target.files[0];
    try {
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const data = evt.target.result;
                const workbook = XLSX.read(data, {type: 'binary'});
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(worksheet, {header: 1});
                
                if (!json.length) throw new Error("File kosong");
                
                const headers = json[0].map(h => (h||'').toString().toLowerCase());
                let cs = -1, cb = -1, csl = -1;
                headers.forEach((h, i) => {
                    if (['stock','kode','code','saham'].some(k => h.includes(k))) cs = i;
                    else if (['buy','harga'].some(k => h.includes(k))) cb = i;
                    else if (['sl','stop'].some(k => h.includes(k))) csl = i;
                });
                
                if (cs === -1 || cb === -1 || csl === -1) {
                    throw new Error("Header tidak ditemukan. Gunakan: Stock, Harga BUY, SL");
                }
                
                const rows = [];
                for (let i = 1; i < json.length; i++) {
                    const row = json[i];
                    if (!row[cs]) continue;
                    let hb = parseFloat(row[cb]);
                    let sl = parseFloat(row[csl]);
                    rows.push({
                        stockCode: String(row[cs]).trim().toUpperCase(),
                        hargaBuy: isNaN(hb) ? "" : hb,
                        stopLoss: isNaN(sl) ? "" : sl
                    });
                }
                
                rows.forEach(item => {
                    const now = Date.now();
                    item.status = 'order';
                    item.history = { order: now };
                    item.dateAdded = new Date(now).toLocaleDateString('id-ID', {day:'2-digit', month:'short'});
                    list.push(item);
                });
                
                save(); renderTable(); updDash();
                toast(`${rows.length} saham diimport ✓`);
            } catch (err) {
                toast(err.message || 'Import gagal', 'err');
            }
        };
        reader.onerror = () => toast('Gagal membaca file', 'err');
        reader.readAsBinaryString(file);
    } catch(err) {
        toast(err.message || 'Import gagal', 'err');
    } finally {
        e.target.value = '';
    }
});

/* ── Export ───────────────────────────────────────── */
$('btn-export').addEventListener('click', async () => {
    if (!list.length) { toast('Trade Plan kosong', 'info'); return; }
    const payload = list.map((r, i) => {
        const c = calcRow(r.hargaBuy, r.stopLoss);
        return {
            "No": i+1, "Stock Code": r.stockCode||'', "Harga BUY": r.hargaBuy||'', "Stop Loss": r.stopLoss||'',
            "% Range": c.ok ? fmtPct(c.pct) : '',
            "Lot Buy": c.ok ? c.lot : '',
            "Nominal Buy": c.ok ? 'Rp ' + fmtIDR(c.nom) : '',
            "Status": r.status ? STATUS_LABEL[r.status] || r.status : 'Order',
        };
    });
    
    try {
        const ws = XLSX.utils.json_to_sheet(payload);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Trade Plan");
        XLSX.writeFile(wb, `trade_plan_${new Date().toISOString().slice(0,10)}.xlsx`);
        toast('Export berhasil ✓');
    } catch(err) {
        toast(err.message || 'Export gagal', 'err');
    }
});

/* ── Filter Chips ────────────────────────────────── */
$('filter-bar').addEventListener('click', e => {
    const chip = e.target.closest('.filter-chip');
    if (!chip) return;
    const f = chip.dataset.filter;

    if (f === 'all') {
        STATUS_LIST.forEach(s => activeFilters.add(s));
        qa('.filter-chip[data-filter]').forEach(c => {
            if (c.dataset.filter !== 'all') c.classList.add('active');
        });
        chip.classList.add('active');
    } else {
        if (activeFilters.has(f)) {
            activeFilters.delete(f);
            chip.classList.remove('active');
        } else {
            activeFilters.add(f);
            chip.classList.add('active');
        }
        if (activeFilters.size < STATUS_LIST.length) {
            $('fc-all').classList.remove('active');
        }
    }
    renderTable();
});

/* ── Init ─────────────────────────────────────────── */
    const applyFontSize = (sz) => {
        const validSz = ['besar', 'sedang', 'kecil'].includes(sz) ? sz : 'besar';
        document.body.classList.remove('font-sedang', 'font-kecil', 'font-besar');
        if (validSz === 'sedang') document.body.classList.add('font-sedang');
        if (validSz === 'kecil') document.body.classList.add('font-kecil');
        
        if ($('set-font-size')) $('set-font-size').value = validSz;

        qa('.font-pill').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.size === validSz);
        });
    };
    const savedFont = localStorage.getItem('mm_font_size') || 'besar';
    applyFontSize(savedFont);

    qa('.font-pill').forEach(btn => {
        btn.addEventListener('click', () => {
            const sz = btn.dataset.size;
            localStorage.setItem('mm_font_size', sz);
            applyFontSize(sz);
            toast(`Ukuran font diubah ke ${sz.toUpperCase()} ✓`, 'info');
        });
    });

    if ($('set-font-size')) {
        $('set-font-size').addEventListener('change', (e) => {
            const val = e.target.value;
            localStorage.setItem('mm_font_size', val);
            applyFontSize(val);
        });
    }

    
    // Telegram Settings & Test Button Listener
    if ($('set-tg-token')) $('set-tg-token').value = cfg.telegramToken || localStorage.getItem('mm_tg_token') || '';
    if ($('set-tg-chatid')) $('set-tg-chatid').value = cfg.telegramChatId || localStorage.getItem('mm_tg_chatid') || '';

                        $('btn-test-tg')?.addEventListener('click', async () => {
        let token = ($('set-tg-token')?.value || '').trim();
        let chatId = ($('set-tg-chatid')?.value || '').trim();
        if (token.toLowerCase().startsWith('bot')) token = token.substring(3).trim();
        if (!token || !chatId) {
            toast('Masukkan Bot Token dan Chat ID Telegram terlebih dahulu', 'err');
            return;
        }

        cfg.telegramToken = token;
        cfg.telegramChatId = chatId;
        localStorage.setItem('mm_tg_token', token);
        localStorage.setItem('mm_tg_chatid', chatId);
        save();

        toast('Menguji notifikasi via backend Google Apps Script...', 'info');
        try {
            const testUrl = `${API_URL}?pin=${encodeURIComponent(getPin())}&action=testTelegram&token=${encodeURIComponent(token)}&chatId=${encodeURIComponent(chatId)}`;
            const resp = await fetch(testUrl);
            const res = await resp.json();
            if (res && res.ok) {
                toast('Notifikasi & Webhook Telegram berhasil diaktifkan ✓', 'info');
            } else {
                let errMsg = res?.description || 'Terjadi kesalahan pada Telegram API';
                if (errMsg.includes('chat not found')) errMsg = 'Chat not found: Buka bot Anda di Telegram & klik START lebih dulu!';
                else if (errMsg.includes('Unauthorized')) errMsg = 'Bot Token salah / tidak valid. Cek kembali token dari @BotFather';
                toast('Gagal: ' + errMsg, 'err');
            }
        } catch(err) {
            toast('Gagal: ' + err.message, 'err');
        }
    });

    // Top-Right Refresh Button Listener (Fetches live prices & triggers with spinning icon)
    const refreshBtn = $('refresh-btn');
    if (refreshBtn) {
        refreshBtn.removeAttribute('onclick');
        refreshBtn.addEventListener('click', () => {
            refreshBtn.classList.add('syncing');
            setTimeout(() => location.reload(), 300); // Add slight delay so user sees the icon spin before refresh
        });
    }

    // Manual Sync Button Listener
    
    // Sortable Header Click Listener (Inside DOMContentLoaded closure)
    document.addEventListener('click', e => {
        const th = e.target.closest('.wl-table thead th.sortable');
        if (th) {
            const col = th.dataset.sort;
            if (sortCol === col) {
                if (sortDir === 'asc') {
                    sortDir = 'desc';
                } else {
                    sortCol = null;
                    sortDir = 'asc';
                }
            } else {
                sortCol = col;
                sortDir = (col === 'nominal') ? 'desc' : 'asc';
            }
            renderTable();
        }
    });

    // Auto-sync initial fetch & 15-minute interval timer (yfinance delay interval)
    setTimeout(() => syncPricesAndTriggers(false), 2000);
    setInterval(() => syncPricesAndTriggers(false), 15 * 60 * 1000);

    toast('Memuat data...', 'info');
    fetch(API_URL + '?pin=' + encodeURIComponent(getPin())).then(r => r.json()).then(data => {
        if(data && data.status === 'error') {
            toast('Gagal memuat: ' + (data.message || 'Error tidak diketahui'), 'err');
            return;
        }
        if(data && data.list) list = data.list;
        if(data && data.watchList) {
            window.wList = data.watchList;
            if (window.renderWatchlist) window.renderWatchlist();
        }
        
        if(data && data.cfg) {
            cfg = Object.assign(cfg, data.cfg);
            if (data.cfg.telegramToken) localStorage.setItem('mm_tg_token', data.cfg.telegramToken);
            if (data.cfg.telegramChatId) localStorage.setItem('mm_tg_chatid', data.cfg.telegramChatId);
            
            if (data.cfg.screenerCustomPresets) {
                window.screenerCustomPresets = data.cfg.screenerCustomPresets;
                localStorage.setItem('screenerCustomPresets', JSON.stringify(window.screenerCustomPresets));
            } else {
                window.screenerCustomPresets = {};
                localStorage.setItem('screenerCustomPresets', '{}');
            }
            if (window.renderTemplates) window.renderTemplates();
        }
        if (!cfg.telegramToken) cfg.telegramToken = localStorage.getItem('mm_tg_token') || '';
        if (!cfg.telegramChatId) cfg.telegramChatId = localStorage.getItem('mm_tg_chatid') || '';
        updDash();
        renderTable();
        syncPricesAndTriggers(false);
        if(data && data.sheetUrl) window.sheetUrl = data.sheetUrl;
        toast('Data termuat ✓ (' + list.length + ' baris)');
    }).catch(err => {
        toast('Gagal memuat: ' + err.message, 'err');
    });

    navigate('tradeplan');
    updDash();
    renderTable();

/* ── Screener & Watchlist Logic ──────────────── */

const TV_FIELDS = [
    {val: 'close', label: 'Harga Terakhir'},
    {val: 'change', label: '% Kenaikan'},
    {val: 'volume', label: 'Volume (Lot)'},
    {val: 'average_volume_10d_calc', label: 'Volume MA 10 (Lot)'},
    {val: 'average_volume_30d_calc', label: 'Volume MA 30 (Lot)'},
    {val: 'average_volume_60d_calc', label: 'Volume MA 60 (Lot)'},
    {val: 'average_volume_90d_calc', label: 'Volume MA 90 (Lot)'},
    {val: 'Value.Traded', label: 'Value (Rp)'},
    {val: 'SMA20', label: 'MA 20 (Simple)'},
    {val: 'SMA50', label: 'MA 50 (Simple)'},
    {val: 'SMA200', label: 'MA 200 (Simple)'},
    {val: 'EMA20', label: 'MA 20 (Expo)'},
    {val: 'EMA50', label: 'MA 50 (Expo)'},
    {val: 'EMA200', label: 'MA 200 (Expo)'},
    {val: 'RSI', label: 'RSI (14)'},
    {val: 'MACD.macd', label: 'MACD Line'},
    {val: 'MACD.signal', label: 'MACD Signal'},
    {val: 'Stoch.K', label: 'Stochastic K'},
    {val: 'Stoch.D', label: 'Stochastic D'},
    {val: 'BB.upper', label: 'Bollinger Upper'},
    {val: 'BB.lower', label: 'Bollinger Lower'},
    {val: 'High.All', label: 'All Time High'},
    {val: 'High.3M', label: '3-Month High'},
];

const TV_OPS = [
    {val: 'greater', label: '> Lebih Dari'},
    {val: 'less', label: '< Kurang Dari'},
    {val: 'equal', label: '= Sama Dengan'},
    {val: 'crosses_above', label: '↑ Menembus Ke Atas'},
    {val: 'crosses_below', label: '↓ Menembus Ke Bawah'}
];

let filterRowCount = 0;
window.addFilterRow = () => {
    filterRowCount++;
    const id = filterRowCount;
    const container = $('filter-rows-container');
    if (!container) return;
    
    const row = document.createElement('div');
    row.id = `filter-row-${id}`;
    row.style = 'display:flex; flex-wrap:wrap; gap:4px; align-items:center; background:var(--bg-2); padding:8px; border-radius:8px;';
    
    const fHtml = renderCustomSelect(`fr-field-${id}`, TV_FIELDS, TV_FIELDS[0].val, 'add-input', 'flex:1; min-width:110px; font-size:calc(12px - var(--fs-diff, 0px)); padding:0 6px;');
    const oHtml = renderCustomSelect(`fr-op-${id}`, TV_OPS, TV_OPS[0].val, 'add-input', 'flex:1; min-width:80px; font-size:calc(12px - var(--fs-diff, 0px)); padding:0 6px;');
    const tHtml = renderCustomSelect(`fr-type-${id}`, [{val:'num',label:'Val'},{val:'ind',label:'Ind'}], 'num', 'add-input', 'width:75px; font-size:calc(12px - var(--fs-diff, 0px)); padding:0 6px; border-top-right-radius:0; border-bottom-right-radius:0;');
    const viHtml = renderCustomSelect(`fr-val-ind-${id}`, TV_FIELDS, TV_FIELDS[0].val, 'add-input', 'display:none; flex:1; font-size:calc(12px - var(--fs-diff, 0px)); padding:0 6px; border-top-left-radius:0; border-bottom-left-radius:0;');

    row.innerHTML = `
        ${fHtml}
        ${oHtml}
        
        <div style="display:flex; flex:1; min-width:130px; gap:4px;">
            ${tHtml}
            <input type="number" id="fr-val-num-${id}" class="add-input" placeholder="0" style="flex:1; padding:4px 6px; font-size:12px; border-top-left-radius:0; border-bottom-left-radius:0;">
            ${viHtml}
        </div>
        
        <button class="btn btn-ghost" onclick="removeFilterRow(${id})" style="padding:4px 8px; color:var(--down); font-weight:bold;">✕</button>
    `;
    
    setTimeout(() => {
        row.querySelectorAll('.custom-select-trigger').forEach(el => {
            el.style.padding = '4px 8px';
            el.style.height = '34px';
        });
    }, 10);
    container.appendChild(row);
};

window.removeFilterRow = (id) => {
    const row = document.getElementById(`filter-row-${id}`);
    if (row) row.remove();
};

window.toggleFilterType = (id) => {
    const type = document.getElementById(`fr-type-${id}`).value;
    const num = document.getElementById(`fr-val-num-${id}`);
    const ind = document.getElementById(`fr-val-ind-${id}`);
    
    if (num && ind) {
        const indWrapper = ind.closest('.custom-select') || ind;
        if (type === 'num') {
            num.classList.remove('hidden');
            indWrapper.style.display = 'none';
        } else {
            num.classList.add('hidden');
            indWrapper.style.display = 'block';
            const trigger = indWrapper.querySelector('.custom-select-trigger');
            if (trigger) { 
                trigger.classList.remove('hidden');
                trigger.style.padding = '4px 8px'; 
                trigger.style.height = '34px'; 
            }
        }
    }
};

const renderWatchlist = () => {
    const tb = $('watchlist-tbody');
    if (!tb) return;
    tb.innerHTML = '';
    if (typeof wList === 'undefined' || !wList || !wList.length) {
        tb.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--text-3);">Watchlist kosong. Tambahkan dari Screener.</td></tr>`;
        return;
    }
    
    // Auto-fetch prices for watchlist too
    const codesToFetch = wList.map(r => r.stockCode).filter(c => c && !stockPrices[c]);
    if (codesToFetch.length > 0 && typeof API_URL !== 'undefined') {
        fetch(`${API_URL}?pin=${encodeURIComponent(getPin())}&action=fetchPrices&tickers=${encodeURIComponent(codesToFetch.join(','))}`)
            .then(r => r.json())
            .then(res => {
                if(res.prices) {
                    res.prices.forEach(p => { stockPrices[p.ticker] = p; });
                    renderWatchlist();
                }
            }).catch(()=>{});
    }

    wList.forEach((r, idx) => {
        const c = r.stockCode || '';
        const pd = stockPrices[c] || {};
        const live = pd.price || r.lastPrice || 0;
        const chg = pd.changePct || 0;
        const sChg = chg > 0 ? '+' : '';
        const clr = chg > 0 ? 'var(--up)' : (chg < 0 ? 'var(--down)' : 'var(--text-1)');
        
        const tr = document.createElement('tr');
        tr.className = 'clickable-row';
        tr.innerHTML = `
            <td class="td-code" style="cursor:pointer;" onclick="moveToTradePlan(${idx})">${c}</td>
            <td style="color:${clr};">${live ? live.toLocaleString('id-ID') : '—'}</td>
            <td style="color:${clr};">${chg ? sChg + chg.toFixed(1) + '%' : '—'}</td>
            <td>${r.dateAdded || '—'}</td>
            <td>
                <button class="btn btn-primary" onclick="moveToTradePlan(${idx})" style="padding:4px 8px; font-size:11px;">Plan</button>
                <button class="btn btn-secondary" onclick="delWatchlist(${idx})" style="padding:4px 8px; font-size:11px; margin-left:4px; border-color:var(--down); color:var(--down);">Del</button>
            </td>
        `;
        tb.appendChild(tr);
    });
};

window.delWatchlist = async (idx) => {
    const code = wList[idx].stockCode;
    const ok = await confirm('Hapus', `Hapus ${code} dari Watchlist?`);
    if(!ok) return;
    wList.splice(idx, 1);
    save(); renderWatchlist();
};

window.moveToTradePlan = (idx) => {
    const row = wList[idx];
    navigate('tradeplan');
    openAddPopup(-1);
    const live = stockPrices[row.stockCode] ? stockPrices[row.stockCode].price : row.lastPrice;
    $('ap-code').value = row.stockCode || '';
    $('ap-buy').value = live || '';
    $('ap-sl').value = '';
    wList.splice(idx, 1); // Remove from watchlist
    save(); renderWatchlist();
};

const runScreener = () => {
    // If running custom, close modal and set active chip
    const sbd = document.getElementById('screener-custom-backdrop');
    if(sbd && !sbd.classList.contains('hidden')) {
        window.currentScreenerPreset = 'custom';
        const chips = document.querySelectorAll('#screener-filter-bar .filter-chip');
        chips.forEach(c => c.classList.remove('active'));
        chips[0].classList.add('active'); // custom is the first chip
        closeScreenerModal();
    }
    
    const tb = $('screener-tbody');
    const preset = window.currentScreenerPreset || 'custom';
    tb.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--text-3);">Memproses data...</td></tr>`;
    
    // TradingView payload
    let filter = [{"left":"close","operation":"nempty"}];
    let sort = {"sortBy":"volume","sortOrder":"desc"};
    let symbols = {"query":{"types":[]},"tickers":[]};
    
    if (preset === 'gainers') {
        sort = {"sortBy":"change","sortOrder":"desc"};
        filter.push({"left":"change","operation":"greater","right":1});
    } else if (preset === 'losers') {
          sort = {"sortBy":"change","sortOrder":"asc"};
          filter.push({"left":"change","operation":"less","right":-1});
      } else if (preset === 'value') {
        sort = {"sortBy":"Value.Traded","sortOrder":"desc"};
    } else if (preset === 'custom') {
        const cCode = ($('scr-code')?.value || '').trim().toUpperCase();
        if (cCode) {
            const tc = cCode.startsWith('IDX:') ? cCode : 'IDX:' + cCode;
            symbols.tickers = [tc];
        }
        
        const container = $('filter-rows-container');
        if (container) {
            const rows = container.children;
            for(let i=0; i<rows.length; i++) {
                const row = rows[i];
                const id = row.id.replace('filter-row-', '');
                const field = $(`fr-field-${id}`).value;
                const op = $(`fr-op-${id}`).value;
                const type = $(`fr-type-${id}`).value;
                
                let rightVal;
                if (type === 'num') {
                    rightVal = parseFloat($(`fr-val-num-${id}`).value) || 0;
                    if (field === 'volume' && op !== 'crosses_above' && op !== 'crosses_below') {
                        rightVal *= 100; // API needs lots * 100 (shares)
                    }
                } else {
                    rightVal = $(`fr-val-ind-${id}`).value;
                }
                
                filter.push({"left": field, "operation": op, "right": rightVal});
            }
        }
    } else {
        // volume
        sort = {"sortBy":"volume","sortOrder":"desc"};
    }
    
    const tvPayload = JSON.stringify({
        filter: filter,
        options: {"lang":"en"},
        markets: ["indonesia"],
        symbols: symbols,
        columns: ["name","description","close","change_abs","change","Value.Traded","volume"],
        sort: sort,
        range: [0, 100]
    });

    const tvUrl = 'https://scanner.tradingview.com/indonesia/scan';
    
    fetch(tvUrl, { 
        method: 'POST', 
        body: tvPayload 
    })
        .then(r => r.json())
        .then(res => {
            if (res.error) throw new Error(res.error);
            if (!res.data || !res.data.length) {
                tb.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:20px;">Tidak ada hasil</td></tr>`;
                return;
            }
            tb.innerHTML = '';
            const formatNumber = (num) => {
                if (num >= 1e12) return (num/1e12).toFixed(2) + ' T';
                if (num >= 1e9) return (num/1e9).toFixed(2) + ' B';
                if (num >= 1e6) return (num/1e6).toFixed(2) + ' M';
                return (num/1000).toFixed(2) + ' K';
            };
            const getLogoColor = (char) => {
                const colors = ['#E53935','#D81B60','#8E24AA','#5E35B1','#3949AB','#1E88E5','#039BE5','#00ACC1','#00897B','#43A047','#F4511E','#6D4C41','#e67e22','#e74c3c','#34495e'];
                const idx = (char.charCodeAt(0) || 65) % colors.length;
                return colors[idx];
            };

            res.data.forEach(item => {
                const sym = item.d[0];
                const desc = item.d[1] || sym;
                const price = item.d[2] || 0;
                const chgAbs = item.d[3] || 0;
                const chgPct = item.d[4] || 0;
                const valueTraded = item.d[5] || 0; // Rp
                const volume = item.d[6] || 0; // shares
                
                const isUp = chgAbs > 0;
                const isDown = chgAbs < 0;
                const clr = isUp ? 'var(--up)' : (isDown ? 'var(--down)' : 'var(--text-1)');
                const sChg = isUp ? '+' : '';
                
                // Format Value in Billion (B) or Million (M)
                const valStr = formatNumber(valueTraded);
                const volStr = formatNumber(volume);
                const logoColor = getLogoColor(sym.charAt(0));

                const tr = document.createElement('tr');
                tr.onclick = () => { if(window.addToWatchlist) window.addToWatchlist(sym, price); };
                tr.style.cursor = 'pointer';
                tr.innerHTML = `
                    <td>
                        <div class="m-sym-wrap" style="text-align:left;">
                            <div class="m-logo" style="background:${logoColor}">${sym.charAt(0)}</div>
                            <div style="text-align:left;">
                                <div class="m-sym">${sym}</div>
                                <div class="m-desc">${desc.substring(0,25)}</div>
                            </div>
                        </div>
                    </td>
                    <td style="text-align:right;">
                        <div class="m-price">${price.toLocaleString('id-ID')}</div>
                        <div class="m-chg" style="color:${clr};">${sChg}${chgAbs}(${sChg}${chgPct.toFixed(2)}%)</div>
                    </td>
                    <td style="text-align:right; padding-right:16px;">
                        <div class="m-price">${valStr}</div>
                        <div class="m-chg">Vol: ${volStr}</div>
                    </td>
                `;
                tb.appendChild(tr);
            });
        })
        .catch(e => {
            tb.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--down);">Error: ${e.message}</td></tr>`;
        });
};
window.runScreener = runScreener;

window.addToWatchlist = (code, live) => {
    if (typeof wList === 'undefined') window.wList = [];
    if (wList.some(r => r.stockCode === code)) {
        toast(`${code} sudah ada di WL`);
        return;
    }
    const dateAdded = new Date().toLocaleDateString('id-ID', {day:'2-digit', month:'short'});
    wList.push({ stockCode: code, lastPrice: live, dateAdded: dateAdded, id: Date.now() });
    save(); renderWatchlist();
    toast(`${code} masuk Watchlist`);
};


let scrSearchTimeout;
if ($('scr-code')) {
    $('scr-code').addEventListener('input', () => {
        clearTimeout(scrSearchTimeout);
        scrSearchTimeout = setTimeout(() => {
            if (window.runScreener) window.runScreener();
        }, 500);
    });
}

if ($('btn-run-screener')) {
    $('btn-run-screener').addEventListener('click', runScreener);
}
if ($('btn-add-filter')) {
    $('btn-add-filter').addEventListener('click', window.addFilterRow);
}
if ($('screener-preset')) {
    $('screener-preset').addEventListener('change', e => {
        const ui = $('screener-custom-ui');
        if (ui) ui.classList.toggle('hidden', e.target.value !== 'custom');
    });
}

window.toggleCustomUI = (val) => {
    const ui = document.getElementById('screener-custom-ui');
    if (ui) ui.classList.toggle('hidden', val !== 'custom');
};

    // --- ROW ACTION MODAL HANDLERS ---
    const raModal = document.getElementById('row-action-modal');
    if (raModal && !raModal.hasAttribute('data-init')) {
        raModal.setAttribute('data-init', 'true');
        
        const closeRaModal = () => {
            raModal.classList.remove('visible');
            setTimeout(() => { raModal.classList.add('hidden'); }, 300);
        };

        // Close on backdrop click OR tapping anywhere on the sheet (except buttons)
        raModal.addEventListener('click', (e) => {
            if (!e.target.closest('button')) closeRaModal();
        });

        // Edit Action
        const editBtn = document.getElementById('ra-edit');
        if (editBtn) {
            editBtn.addEventListener('click', (e) => {
                const idx = e.currentTarget.dataset.i;
                // Instantly hide without animation to avoid glitch overlap
                document.getElementById('row-action-modal').classList.add('hidden');
                document.getElementById('row-action-modal').classList.remove('visible');
                if (idx !== undefined) openAddPopup(parseInt(idx));
            });
        }

        // Delete Action
        const delBtn = document.getElementById('ra-del');
        if (delBtn) {
            delBtn.addEventListener('click', async (e) => {
                const idx = parseInt(e.currentTarget.dataset.i);
                // Instantly hide without animation
                document.getElementById('row-action-modal').classList.add('hidden');
                document.getElementById('row-action-modal').classList.remove('visible');
                if (isNaN(idx)) return;
                
                const code = list[idx]?.stockCode || `#${idx+1}`;
                const ok = await confirm('Hapus Saham', `Hapus ${code} dari Trade Plan?`);
                if (!ok) return;
                
                list.splice(idx, 1);
                save(); 
                renderTable(); 
                updDash();
                toast(`${code} dihapus`);
            });
        }
    }



// Swipe to open/close sidebar on mobile
let touchStartX = 0;
let touchStartY = 0;
document.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
}, {passive:true});

document.addEventListener('touchend', e => {
    if (window.innerWidth > 768) return;
    const teX = e.changedTouches[0].screenX;
    const teY = e.changedTouches[0].screenY;
    const dx = teX - touchStartX;
    const dy = teY - touchStartY;
    
    if (Math.abs(dx) > Math.abs(dy)) {
        // Swipe right from edge
        if (dx > 40 && touchStartX < 30) {
            if (document.getElementById('sidebar')) document.getElementById('sidebar').classList.add('open');
            if (document.getElementById('sidebar-overlay')) document.getElementById('sidebar-overlay').classList.add('visible');
        }
        // Swipe left anywhere
        else if (dx < -40) {
            if (document.getElementById('sidebar') && document.getElementById('sidebar').classList.contains('open')) {
                document.getElementById('sidebar').classList.remove('open');
                if (document.getElementById('sidebar-overlay')) document.getElementById('sidebar-overlay').classList.remove('visible');
            }
        }
    }
}, {passive:true});

// DOMContentLoaded



    

window.currentScreenerPreset = 'custom';
window.setScreenerPreset = (val, el) => {
    const chips = document.querySelectorAll('#screener-filter-bar .filter-chip');
    
    if (val === 'custom') {
        try { if (window.renderTemplates) window.renderTemplates(); } catch(e) {}
        
        // Just open the modal, don't change active chip yet until they click run
        const bd = document.getElementById('screener-custom-backdrop');
        const pu = document.getElementById('screener-custom-popup');
        if(bd && pu) {
            bd.classList.remove('hidden');
            setTimeout(() => { pu.classList.add('visible'); }, 10);
        }
    } else {
        window.currentScreenerPreset = val;
        chips.forEach(c => c.classList.remove('active'));
        if (el) el.classList.add('active');
        if (window.runScreener) window.runScreener();
    }
};

// Screener modal close handlers
const closeScreenerModal = () => {
    const bd = document.getElementById('screener-custom-backdrop');
    const pu = document.getElementById('screener-custom-popup');
    if(bd && pu) {
        pu.classList.remove('visible');
        setTimeout(() => bd.classList.add('hidden'), 100);
    }
};

const sbd = document.getElementById('screener-custom-backdrop');
if(sbd) {
    sbd.addEventListener('click', e => {
        if (e.target === sbd) closeScreenerModal();
    });
}
const sClose = document.getElementById('screener-custom-close');
if(sClose) {
    sClose.addEventListener('click', closeScreenerModal);
}

// Screener Custom Presets Logic
window.screenerCustomPresets = JSON.parse(localStorage.getItem('screenerCustomPresets') || '{}') || {};
window.currentCustomPresetName = '';

window.renderTemplates = () => {
    try {
        const container = document.getElementById('scr-templates-container');
        if (!container) return;
        const presets = window.screenerCustomPresets || {};
        const keys = Object.keys(presets);
        if (keys.length === 0) {
            container.innerHTML = '<span style="font-size:12px; color:var(--text-3); font-style:italic; padding-top:6px;">Belum ada template</span>';
            return;
        }
        let html = '';
        keys.forEach(k => {
            const isSel = (k === window.currentCustomPresetName);
            const autoScanStr = (cfg.screenerAutoScan === k) ? ' ⭐' : '';
            if (isSel) {
                html += `<div class="filter-chip active" style="padding-right:2px; display:flex; align-items:center;">
                            <span onclick="window.loadCustomPreset('${k.replace(/'/g, "\'")}')">${k}${autoScanStr}</span>
                            <span onclick="window.deleteCustomPreset('${k.replace(/'/g, "\'")}')" style="margin-left:4px; padding:2px 6px; font-size:14px; font-weight:bold; cursor:pointer; color:var(--down);">&times;</span>
                         </div>`;
            } else {
                html += `<div class="filter-chip" onclick="window.loadCustomPreset('${k.replace(/'/g, "\'")}')">${k}${autoScanStr}</div>`;
            }
        });
        container.innerHTML = html;
    } catch(e) {
        console.error('Error rendering templates:', e);
    }
};

window.deleteCustomPreset = (name) => {
    if (!confirm('Hapus template "' + name + '"?')) return;
    delete window.screenerCustomPresets[name];
    if (window.currentCustomPresetName === name) window.currentCustomPresetName = '';
    if (cfg.screenerAutoScan === name) {
        cfg.screenerAutoScan = '';
    }
    cfg.screenerCustomPresets = window.screenerCustomPresets;
    save();
    window.renderTemplates();
};

window.clearAllFilters = () => {
    window.currentCustomPresetName = '';
    const container = document.getElementById('filter-rows-container');
    if (container) container.innerHTML = '';
    window.renderTemplates();
};

window.setAutoScan = () => {
    if (!window.currentCustomPresetName) {
        if (confirm("Kosongkan Auto-Scan? (Screener tidak akan berjalan otomatis)")) {
            cfg.screenerAutoScan = '';
            save();
            window.renderTemplates();
            toast("Auto-Scan dimatikan ✓");
        } else if (document.getElementById('filter-rows-container') && document.getElementById('filter-rows-container').children.length > 0) {
            toast('Silakan Save filter ini dulu sebelum di set Auto-Scan', 'err');
        }
        return;
    }
    cfg.screenerAutoScan = window.currentCustomPresetName;
    save();
    window.renderTemplates();
    toast("Auto-Scan diset ke " + window.currentCustomPresetName + " ✓");
};

window.saveAsCustomPreset = () => {
    const name = prompt("Masukkan nama untuk preset ini:");
    if (!name) return;
    savePresetWithName(name);
};

window.saveCustomPreset = () => {
    if (!window.currentCustomPresetName) {
        window.saveAsCustomPreset();
    } else {
        savePresetWithName(window.currentCustomPresetName);
    }
};

function savePresetWithName(name) {
    try {
        const code = $('scr-code')?.value || '';
        const container = $('filter-rows-container');
        const rows = [];
        if (container) {
            for (let i=0; i<container.children.length; i++) {
                const r = container.children[i];
                const id = r.id.replace('filter-row-', '');
                rows.push({
                    field: $(`fr-field-${id}`)?.value,
                    op: $(`fr-op-${id}`)?.value,
                    type: $(`fr-type-${id}`)?.value,
                    valNum: $(`fr-val-num-${id}`)?.value,
                    valInd: $(`fr-val-ind-${id}`)?.value
                });
            }
        }
        
        if (!window.screenerCustomPresets) window.screenerCustomPresets = {};
        window.screenerCustomPresets[name] = { code, rows };
        localStorage.setItem('screenerCustomPresets', JSON.stringify(window.screenerCustomPresets));
        window.currentCustomPresetName = name;
        
        if (window.renderTemplates) window.renderTemplates();
        
        toast(`Preset "${name}" berhasil disimpan!`, 'ok');
        
        // Timeout to allow UI to update before blocking or fetching
        setTimeout(() => {
            if (typeof save === 'function') save();
        }, 300);
        
    } catch(err) {
        console.error('Error saving preset:', err);
        alert('Gagal save preset: ' + err.message + '\nStack:\n' + (err.stack || ''));
    }
}

window.loadCustomPreset = (name) => {
    if (!name || !window.screenerCustomPresets[name]) {
        window.currentCustomPresetName = '';
        if (window.renderTemplates) window.renderTemplates();
        return;
    }
    window.currentCustomPresetName = name;
    if (window.renderTemplates) window.renderTemplates();
    const data = window.screenerCustomPresets[name];
    if ($('scr-code')) $('scr-code').value = data.code || '';
    
    // Clear existing
    const container = $('filter-rows-container');
    if (container) container.innerHTML = '';
    
    const setCustomSelectValue = (elId, val) => {
        const hidden = $(elId);
        if (!hidden) return;
        hidden.value = val;
        const wrapper = hidden.closest('.custom-select');
        if (wrapper) {
            const opt = wrapper.querySelector(`.custom-option[data-value="${val}"]`);
            if (opt) {
                const text = wrapper.querySelector('.custom-select-text');
                if (text) text.textContent = opt.textContent;
                wrapper.querySelectorAll('.custom-option').forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
            }
        }
    };
    
    // Load rows
    data.rows.forEach(r => {
        window.addFilterRow();
        // The newly added row has id = filterRowCount
        const id = filterRowCount;
        
        // Timeout to allow DOM appending to finish visually before we update options
        setTimeout(() => {
            setCustomSelectValue(`fr-field-${id}`, r.field);
            setCustomSelectValue(`fr-op-${id}`, r.op);
            
            if ($(`fr-type-${id}`)) {
                setCustomSelectValue(`fr-type-${id}`, r.type);
                if (window.toggleFilterType) window.toggleFilterType(id);
            }
            if ($(`fr-val-num-${id}`)) $(`fr-val-num-${id}`).value = r.valNum;
            setCustomSelectValue(`fr-val-ind-${id}`, r.valInd);
        }, 10);
    });
};


}); // Close the main DOMContentLoaded block

// Initialize preset select on load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (window.renderTemplates) window.renderTemplates();
    }, 500);
});
