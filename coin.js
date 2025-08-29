/* Coin detail page with Chart.js and CSV export */
(function(){
  const params = new URLSearchParams(location.search);
  const id = params.get('coin') || 'bitcoin';
  const vs = params.get('vs') || 'usd';
  const titleEl = document.getElementById('coin-title');
  const statEl = document.getElementById('statline');
  const ctx = document.getElementById('priceChart');
  const tfButtons = document.querySelectorAll('[data-days]');
  const csvBtn = document.getElementById('csv');
  const statusEl = document.getElementById('load-status');

  let chart, lastSeries = [];

  if(!ctx) return;

  async function loadMeta(){
    try{
      const res = await fetch(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`);
      const data = await res.json();
      titleEl.textContent = `${data.name} (${data.symbol.toUpperCase()})`;
      const price = data.market_data?.current_price?.[vs] ?? data.market_data?.current_price?.usd;
      const chg = data.market_data?.price_change_percentage_24h;
      statEl.innerHTML = `
        <strong>${fmt(price, vs.toUpperCase())}</strong>
        <span style="margin-left:8px;color:${chg>=0?'#16a34a':'#ef4444'}">${(chg>=0?'+':'') + (chg?.toFixed(2) ?? '--')}%</span>
      `;
      document.getElementById('coin-icon').src = data.image?.small || data.image?.thumb || '';
    }catch(e){ console.error(e); }
  }

  async function loadSeries(days){
    status('Loading chart…');
    try{
      const res = await fetch(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?vs_currency=${encodeURIComponent(vs)}&days=${encodeURIComponent(days)}`);
      const json = await res.json();
      const series = (json.prices || []).map(([t,p])=>({ t: new Date(t), p }));
      lastSeries = series;
      draw(series, days);
      status('');
    }catch(e){
      console.error(e);
      status('Failed to load chart');
    }
  }

  function draw(series, days){
    const labels = series.map(d=>d.t);
    const data = series.map(d=>d.p);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if(chart){ chart.destroy(); }
    chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Price',
          data,
          tension: 0.25,
          fill: true,
          pointRadius: 0,
          borderWidth: 2
        }]
      },
      options: {
        animation: reduced ? false : { duration: 350 },
        plugins: { legend: { display:false }, tooltip: { mode:'index', intersect:false } },
        scales: {
          x: { type:'time', time:{ unit: pickUnit(days) }, grid:{ display:false } },
          y: { grid:{ color:'rgba(0,0,0,0.14)' }, ticks:{ callback:(v)=>shortNum(v, vs.toUpperCase()) } }
        },
        maintainAspectRatio:false
      }
    });
  }

  // timeframe switching
  tfButtons.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      tfButtons.forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const d = btn.getAttribute('data-days');
      loadSeries(d);
    });
  });

  // CSV export for quants
  csvBtn.addEventListener('click', ()=>{
    if(!lastSeries.length) return;
    const header = 'timestamp_iso,price\n';
    const rows = lastSeries.map(r => `${r.t.toISOString()},${r.p}`).join('\n');
    const blob = new Blob([header + rows], {type:'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${id}_${vs}_prices.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  function status(msg){ if(statusEl) statusEl.textContent = msg; }

  function pickUnit(days){
    if(days <= 2) return 'hour';
    if(days <= 30) return 'day';
    if(days <= 180) return 'week';
    return 'month';
  }
  function fmt(n, vs){
    const sym = vs==='USD'?'$':vs==='EUR'?'€':vs==='NGN'?'₦':'';
    const opts = {maximumFractionDigits: n<1?6:2};
    return sym + Number(n||0).toLocaleString(undefined, opts);
  }
  function shortNum(n, vs){
    const sym = vs==='USD'?'$':vs==='EUR'?'€':vs==='NGN'?'₦':'';
    if(n>=1e12) return sym+(n/1e12).toFixed(2)+'T';
    if(n>=1e9)  return sym+(n/1e9 ).toFixed(2)+'B';
    if(n>=1e6)  return sym+(n/1e6 ).toFixed(2)+'M';
    if(n>=1e3)  return sym+(n/1e3 ).toFixed(0)+'K';
    return sym+Number(n).toFixed(2);
  }

  // init
  loadMeta().then(()=>loadSeries(document.querySelector('[data-days].active').getAttribute('data-days')));
})();
