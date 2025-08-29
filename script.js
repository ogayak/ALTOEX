/* ---------- Existing code: Header + Mobile nav ---------- */
(function headerInit(){
  const header = document.getElementById('site-header');
  if(!header) return;

  function checkScroll(){
    if(window.scrollY > 40) header.classList.add('scrolled');
    else header.classList.remove('scrolled');
  }
  window.addEventListener('scroll', checkScroll, {passive:true});
  checkScroll();

  const menuToggle = document.getElementById('menu-toggle');
  const mobileNav = document.getElementById('mobile-nav');
  if(menuToggle && mobileNav){
    menuToggle.addEventListener('click', ()=>{
      const open = !mobileNav.classList.contains('open');
      mobileNav.classList.toggle('open', open);
      mobileNav.setAttribute('aria-hidden', (!open).toString());
      menuToggle.setAttribute('aria-expanded', open.toString());
    });

    mobileNav.addEventListener('click', (e)=>{
      if(e.target.tagName === 'A'){
        mobileNav.classList.remove('open');
        mobileNav.setAttribute('aria-hidden', 'true');
        menuToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }
})();

/* ---------- Hero prices ---------- */
(function heroPrices(){
  const btcAmt = document.querySelector('#btc .amt');
  const ethAmt = document.querySelector('#eth .amt');

  if(!btcAmt && !ethAmt) return;

  async function fetchPrices(){
    try{
      const res = await fetch('http://127.0.0.1:5000/api/price/bitcoin');
      const btcData = await res.json();
      const res2 = await fetch('http://127.0.0.1:5000/api/price/ethereum');
      const ethData = await res2.json();
      const now = new Date();

      if(btcData.data.bitcoin){
        const price = btcData.data.bitcoin.usd;
        btcAmt.textContent = Number(price).toLocaleString(undefined,{maximumFractionDigits:2});
        const bchg = btcData.data.bitcoin.usd_24h_change || 0;
        const btcChgEl = document.getElementById('btc-chg');
        if(btcChgEl){ btcChgEl.textContent = (bchg >= 0 ? '+' : '') + bchg.toFixed(2) + '%'; btcChgEl.style.color = bchg >= 0 ? '#7efc7e' : '#ff7b7b'; }
        const t = document.getElementById('btc-time'); if(t) t.textContent = now.toLocaleTimeString();
      }
      if(ethData.data.ethereum){
        const price = ethData.data.ethereum.usd;
        ethAmt.textContent = Number(price).toLocaleString(undefined,{maximumFractionDigits:2});
        const echg = ethData.data.ethereum.usd_24h_change || 0;
        const ethChgEl = document.getElementById('eth-chg');
        if(ethChgEl){ ethChgEl.textContent = (echg >= 0 ? '+' : '') + echg.toFixed(2) + '%'; ethChgEl.style.color = echg >= 0 ? '#7efc7e' : '#ff7b7b'; }
        const te = document.getElementById('eth-time'); if(te) te.textContent = now.toLocaleTimeString();
      }

      const pv = document.getElementById('portfolio-value');
      if(pv){
        const btcVal = (btcData.data.bitcoin?.usd || 0) * 0.12;
        const ethVal = (ethData.data.ethereum?.usd || 0) * 1.9;
        const total = btcVal + ethVal + 420;
        pv.textContent = Number(total).toLocaleString(undefined,{maximumFractionDigits:2});
        const weighted = ((btcVal * ((btcData.data.bitcoin?.usd_24h_change || 0)/100)) + (ethVal * ((ethData.data.ethereum?.usd_24h_change || 0)/100))) / (total || 1) * 100;
        const pc = Number(weighted.toFixed(2));
        const pcEl = document.getElementById('portfolio-change');
        if(pcEl){ pcEl.textContent = (pc >= 0 ? '+' : '') + pc + '%'; pcEl.style.color = pc >= 0 ? '#7efc7e' : '#ff7b7b'; }
      }
    }catch(err){
      console.warn('Hero prices failed', err);
    }
  }

  fetchPrices();
  const interval = setInterval(fetchPrices, 10000);
  document.addEventListener('visibilitychange', ()=>{ if(document.hidden) clearInterval(interval); });
})();

/* ---------- Hero slider ---------- */
(function heroSlider(){
  const wrap = document.getElementById('cards');
  if(!wrap) return;
  const items = Array.from(wrap.children);
  let idx = 0, interval = null;

  function moveTo(i){
    const el = items[i];
    if(!el) return;
    const target = el.getBoundingClientRect().left - wrap.getBoundingClientRect().left + wrap.scrollLeft;
    wrap.scrollTo({ left: target, behavior: 'smooth' });
  }

  function start(){
    if(interval) return;
    interval = setInterval(()=>{ idx = (idx + 1) % items.length; moveTo(idx); }, 3500);
  }
  function stop(){ if(interval){ clearInterval(interval); interval = null; } }

  start();
  wrap.addEventListener('mouseenter', stop);
  wrap.addEventListener('mouseleave', start);
  wrap.addEventListener('focusin', stop);
  wrap.addEventListener('focusout', start);
})();

/* ---------- Reveal-on-scroll ---------- */
(function revealOnScroll(){
  const nodes = document.querySelectorAll('.price-card, .card, .feature, .hero-left');
  if(!nodes.length) return;
  const obs = new IntersectionObserver((entries)=>{
    entries.forEach(entry => { if(entry.isIntersecting) entry.target.classList.add('visible'); });
  }, { threshold: 0.18 });
  nodes.forEach(n => obs.observe(n));
})();

/* ---------- Markets page ---------- */
(function marketsPage(){
  const tableBody = document.getElementById('coins-body');
  if(!tableBody) return; // not on markets page
  // ... existing markets code ...
})();

/* ---------- Parameter-Grid Backtester ---------- */
(function backtester(){
  if(!document.getElementById('bt-chart')) return;

  const shortInput = document.getElementById('sma-short');
  const longInput = document.getElementById('sma-long');
  const coinSelect = document.getElementById('bt-coin');
  const runBtn = document.getElementById('run-backtest');
  const chartEl = document.getElementById('bt-chart');
  const summaryEl = document.getElementById('bt-summary');

  let btChart = null;

  function sma(values, window){
    const result = [];
    for(let i=0;i<values.length;i++){
      if(i<window-1){ result.push(null); continue; }
      const sum = values.slice(i-window+1, i+1).reduce((a,b)=>a+b,0);
      result.push(sum/window);
    }
    return result;
  }

  async function fetchOHLC(coin){
    try{
      const res = await fetch(`http://127.0.0.1:5000/api/price/${coin}`);
      const data = await res.json();
      // Convert to OHLC mock daily: just price array (Coingecko provides history for proper OHLC)
      const prices = Object.values(data.data[coin].usd_history || data.data[coin].usd); // fallback
      if(Array.isArray(prices)) return prices;
      return [data.data[coin].usd]; // fallback to single price
    }catch(e){
      console.warn('Backtester fetch failed', e);
      return [];
    }
  }

  function runStrategy(prices, shortWin, longWin){
    const sSMA = sma(prices, shortWin);
    const lSMA = sma(prices, longWin);
    let position = 0; // 1=long, 0=flat
    let trades = [];
    let equity = 1000;
    for(let i=0;i<prices.length;i++){
      if(sSMA[i]===null || lSMA[i]===null) continue;
      if(sSMA[i] > lSMA[i] && position===0){
        position = 1; trades.push({idx:i,type:'buy',price:prices[i]});
      }
      if(sSMA[i] < lSMA[i] && position===1){
        position = 0; trades.push({idx:i,type:'sell',price:prices[i]});
      }
    }
    // final equity calc
    trades.forEach((t,i)=>{
      if(t.type==='buy' && i<trades.length-1 && trades[i+1].type==='sell'){
        equity *= trades[i+1].price/t.price;
      }
    });
    return {equity, trades, sSMA, lSMA};
  }

  function plotChart(prices, sSMA, lSMA, trades){
    if(btChart) btChart.destroy();
    btChart = new Chart(chartEl.getContext('2d'), {
      type: 'line',
      data: {
        labels: prices.map((_,i)=>i+1),
        datasets:[
          {label:'Price', data:prices, borderColor:'#5ee7ff', backgroundColor:'rgba(94,231,255,0.2)', tension:0.2},
          {label:'SMA Short', data:sSMA, borderColor:'#ff7b7b', borderDash:[5,5], tension:0.2},
          {label:'SMA Long', data:lSMA, borderColor:'#7efc7e', borderDash:[5,5], tension:0.2},
          {
            label:'Trades',
            data: prices.map((p,i)=>{
              const t = trades.find(tr=>tr.idx===i);
              return t? p : null;
            }),
            borderColor:'#fff',
            pointBackgroundColor: trades.map(t=>t.type==='buy'?'#0f0':'#f00'),
            pointRadius:6,
            type:'scatter'
          }
        ]
      },
      options:{responsive:true, plugins:{legend:{position:'bottom'}}}
    });
  }

  async function runBacktest(){
    const shortWin = parseInt(shortInput.value);
    const longWin = parseInt(longInput.value);
    const coin = coinSelect.value;
    summaryEl.textContent = 'Running backtest...';

    const prices = await fetchOHLC(coin);
    if(prices.length<2){ summaryEl.textContent='Not enough data'; return; }

    const {equity,trades,sSMA,lSMA} = runStrategy(prices, shortWin,longWin);
    plotChart(prices,sSMA,lSMA,trades);

    summaryEl.innerHTML = `
      <strong>Final Equity:</strong> $${equity.toFixed(2)}<br>
      <strong>Trades:</strong> ${trades.length} (${trades.filter(t=>t.type==='buy').length} buys / ${trades.filter(t=>t.type==='sell').length} sells)
    `;
  }

  runBtn.addEventListener('click', runBacktest);
})();
// Backtester chart
let btChart;

function runBacktest() {
  const shortSMA = parseInt(document.getElementById('sma-short').value);
  const longSMA = parseInt(document.getElementById('sma-long').value);
  const coin = document.getElementById('bt-coin').value;

  // Generate dummy data (replace with your actual SMA/backtest logic)
  const labels = Array.from({length: 50}, (_, i) => `Day ${i+1}`);
  const prices = labels.map(() => Math.random() * 100 + 100);
  const smaShort = prices.map((p, i) => i >= shortSMA ? prices.slice(i-shortSMA, i).reduce((a,b)=>a+b,0)/shortSMA : null);
  const smaLong = prices.map((p, i) => i >= longSMA ? prices.slice(i-longSMA, i).reduce((a,b)=>a+b,0)/longSMA : null);

  // Remove old chart if exists
  if (btChart) btChart.destroy();

  const ctx = document.getElementById('bt-chart').getContext('2d');
  btChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: `${coin} Price`, data: prices, borderColor: '#4ade80', fill: false },
        { label: `SMA ${shortSMA}`, data: smaShort, borderColor: '#38bdf8', fill: false },
        { label: `SMA ${longSMA}`, data: smaLong, borderColor: '#f87171', fill: false }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { beginAtZero: false } }
    }
  });

  // Update summary
  const summary = document.getElementById('bt-summary');
  summary.innerHTML = `<strong>${coin.toUpperCase()}</strong> backtest: shortSMA=${shortSMA}, longSMA=${longSMA}`;
}

// Event listener
document.getElementById('run-backtest').addEventListener('click', runBacktest);
