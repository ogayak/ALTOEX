// app.js — header + mobile nav + live prices + slider + small UI
(function(){
  // ---------- Utilities ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Header / Mobile nav ----------
  function initHeader() {
    const menuBtn = document.getElementById('menu-toggle');
    const mobileNav = document.getElementById('mobile-nav');
    const body = document.body;

    if(!menuBtn || !mobileNav) return;

    menuBtn.addEventListener('click', (e) => {
      const open = !mobileNav.classList.contains('open');
      mobileNav.classList.toggle('open', open);
      menuBtn.setAttribute('aria-expanded', open.toString());
      mobileNav.setAttribute('aria-hidden', (!open).toString());
      if(open) body.classList.add('no-scroll'); else body.classList.remove('no-scroll');
    });

    // close when link clicked
    mobileNav.addEventListener('click', (e) => {
      const a = e.target.closest('a');
      if(a){
        mobileNav.classList.remove('open');
        mobileNav.setAttribute('aria-hidden','true');
        menuBtn.setAttribute('aria-expanded','false');
        body.classList.remove('no-scroll');
      }
    });

    // close on escape
    document.addEventListener('keydown', (e)=>{
      if(e.key === 'Escape' && mobileNav.classList.contains('open')){
        mobileNav.classList.remove('open');
        mobileNav.setAttribute('aria-hidden','true');
        menuBtn.setAttribute('aria-expanded','false');
        body.classList.remove('no-scroll');
      }
    });

    // ensure mobile panel closes on resize to desktop
    window.addEventListener('resize', ()=> {
      if(window.innerWidth > 860 && mobileNav.classList.contains('open')){
        mobileNav.classList.remove('open');
        mobileNav.setAttribute('aria-hidden','true');
        menuBtn.setAttribute('aria-expanded','false');
        body.classList.remove('no-scroll');
      }
    });
  }

  // ---------- Live prices (CoinGecko) ----------
  const COINS = [
    { id: 'bitcoin', symbol: 'BTC', elId: 'btc' },
    { id: 'ethereum', symbol: 'ETH', elId: 'eth' },
    { id: 'solana', symbol: 'SOL', elId: 'sol' }
  ];

  async function fetchPrices(){
    try{
      const ids = COINS.map(c=>c.id).join(',');
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd&include_24hr_change=true`;
      const res = await fetch(url);
      if(!res.ok) throw new Error('price fetch failed: ' + res.status);
      const data = await res.json();
      const now = new Date();
      // ticker string builder
      const parts = [];

      COINS.forEach(c=>{
        const d = data[c.id];
        if(!d) return;
        const price = d.usd;
        const chg = d.usd_24h_change || 0;
        parts.push(`${c.symbol} $${Number(price).toLocaleString(undefined,{maximumFractionDigits:2})} (${chg>=0?'+':''}${chg.toFixed(2)}%)`);

        const el = document.getElementById(c.elId);
        if(!el) return;
        const amt = el.querySelector('.amt');
        if(amt) amt.textContent = Number(price).toLocaleString(undefined,{maximumFractionDigits:2});
        const chgEl = document.getElementById(`${c.elId}-chg`);
        if(chgEl){
          chgEl.textContent = (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%';
          chgEl.style.color = chg >= 0 ? '#7efc7e' : '#ff7b7b';
        }
        const timeEl = document.getElementById(`${c.elId}-time`);
        if(timeEl) timeEl.textContent = now.toLocaleTimeString();
        // make visible
        el.classList.add('visible');
      });

      // ticker
      const ticker = $('#ticker');
      if(ticker) ticker.textContent = parts.join('  ·  ');

      // portfolio mock calculation (demo)
      const btcVal = (data.bitcoin?.usd || 0) * 0.12;
      const ethVal = (data.ethereum?.usd || 0) * 1.9;
      const total = btcVal + ethVal + 420;
      const pv = $('#portfolio-value');
      if(pv) pv.textContent = Number(total).toLocaleString(undefined,{maximumFractionDigits:2});
      const weighted = ((btcVal * ((data.bitcoin?.usd_24h_change||0)/100)) + (ethVal * ((data.ethereum?.usd_24h_change||0)/100))) / (total||1) * 100;
      const pc = Number(weighted.toFixed(2));
      const pctEl = $('#portfolio-change');
      if(pctEl){
        pctEl.textContent = (pc >= 0 ? '+' : '') + pc + '%';
        pctEl.style.color = pc >= 0 ? '#7efc7e' : '#ff7b7b';
      }
    }catch(err){
      console.error(err);
      const ticker = $('#ticker');
      if(ticker) ticker.textContent = 'Live prices currently unavailable';
    }
  }

  // ---------- Slider auto-scroll (cards) ----------
  function initSlider(){
    const wrap = document.getElementById('cards');
    if(!wrap) return;
    const items = Array.from(wrap.children);
    let idx = 0;
    let interval = null;

    function moveTo(i){
      const el = items[i];
      if(!el) return;
      const target = el.getBoundingClientRect().left - wrap.getBoundingClientRect().left + wrap.scrollLeft;
      wrap.scrollTo({ left: target, behavior: prefersReduced ? 'auto' : 'smooth' });
    }

    function start(){
      if(prefersReduced) return;
      if(interval) return;
      interval = setInterval(()=>{
        idx = (idx + 1) % items.length;
        moveTo(idx);
      }, 3500);
    }
    function stop(){ if(interval){ clearInterval(interval); interval = null; } }

    start();
    wrap.addEventListener('mouseenter', stop);
    wrap.addEventListener('mouseleave', start);
    wrap.addEventListener('focusin', stop);
    wrap.addEventListener('focusout', start);

    // keep idx in sync with manual scroll
    let timer;
    wrap.addEventListener('scroll', ()=>{
      stop();
      clearTimeout(timer);
      timer = setTimeout(()=>{
        let nearest = 0, nearestDiff = Infinity;
        items.forEach((it,i)=>{
          const diff = Math.abs(it.offsetLeft - wrap.scrollLeft);
          if(diff < nearestDiff){ nearestDiff = diff; nearest = i; }
        });
        idx = nearest;
        start();
      }, 600);
    });
  }

  // ---------- Reveal on scroll ----------
  function initReveal(){
    if(prefersReduced) {
      // make everything visible
      $$('.tile, .card, .box, .brand-hero').forEach(el=>el.classList.add('visible'));
      return;
    }
    const observer = new IntersectionObserver((entries)=>{
      entries.forEach(entry=>{
        if(entry.isIntersecting) entry.target.classList.add('visible');
      });
    }, {threshold: 0.18});
    $$('.tile, .card, .box, .brand-hero').forEach(el => observer.observe(el));
  }

  // ---------- Newsletter -->
  function initNewsletter(){
    const form = document.getElementById('newsletter');
    if(!form) return;
    const msg = document.getElementById('newsletter-msg');
    form.addEventListener('submit', (e)=>{
      e.preventDefault();
      const email = document.getElementById('newsletter-email').value;
      // demo: show success. In prod -> send to API
      if(msg) msg.textContent = `Thanks — ${email} added to the Alpha Feed. Check your inbox.`;
      form.reset();
      setTimeout(()=>{ if(msg) msg.textContent = ''; }, 6000);
    });
  }

  // ---------- Init all ----------
  function init(){
    initHeader();
    initSlider();
    initReveal();
    initNewsletter();
    // first fetch and then interval
    fetchPrices();
    setInterval(fetchPrices, 10000);
    // set year
    const y = document.getElementById('year');
    if(y) y.textContent = new Date().getFullYear();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
// --- Backtester with real historical data ---
const smaShortInput = document.getElementById('sma-short');
const smaLongInput = document.getElementById('sma-long');
const coinSelect = document.getElementById('bt-coin');
const runBtn = document.getElementById('run-backtest');
const chartCanvas = document.getElementById('bt-chart');
const summary = document.getElementById('bt-summary');

let btChart = null;

async function fetchCoinData(coin) {
  const coinIdMap = { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana' };
  const days = 50; // fetch last 50 days
  const url = `https://api.coingecko.com/api/v3/coins/${coinIdMap[coin]}/market_chart?vs_currency=usd&days=${days}&interval=daily`;
  const res = await fetch(url);
  const data = await res.json();
  // data.prices = [ [timestamp, price], ... ]
  return data.prices.map(p => p[1]);
}

function calculateSMA(prices, period) {
  return prices.map((v, idx, arr) => {
    if (idx < period) return null;
    return arr.slice(idx - period, idx).reduce((a, b) => a + b, 0) / period;
  });
}

function renderChart(labels, prices, smaShort, smaLong) {
  if (btChart) btChart.destroy();
  btChart = new Chart(chartCanvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Price', data: prices, borderColor: '#4bc0c0', fill: false },
        { label: 'SMA Short', data: smaShort, borderColor: '#ff6384', fill: false },
        { label: 'SMA Long', data: smaLong, borderColor: '#ffcd56', fill: false },
      ]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

runBtn.addEventListener('click', async () => {
  const shortVal = parseInt(smaShortInput.value);
  const longVal = parseInt(smaLongInput.value);
  const coin = coinSelect.value;

  if (shortVal >= longVal) {
    summary.textContent = "Short SMA must be less than Long SMA";
    return;
  }

  summary.textContent = "Fetching data...";
  try {
    const prices = await fetchCoinData(coin);
    const labels = prices.map((_, i) => `Day ${i+1}`);
    const smaShort = calculateSMA(prices, shortVal);
    const smaLong = calculateSMA(prices, longVal);
    renderChart(labels, prices, smaShort, smaLong);
    summary.textContent = `Backtest completed for ${coin} (SMA ${shortVal}, ${longVal})`;
  } catch (err) {
    console.error(err);
    summary.textContent = "Error fetching data. Try again later.";
  }
});
