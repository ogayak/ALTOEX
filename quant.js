/*
quant.js
Client-side prototype backtester:
- load CoinGecko series or CSV
- compute SMA indicators
- simple SMA crossover all-in/backtest
- render price + buy/sell markers + equity curve
- export trades/equity CSV
*/

(async function(){
  // DOM
  const sourceEl = document.getElementById('source');
  const coinIdEl = document.getElementById('coinId');
  const daysEl = document.getElementById('days');
  const chooseCsvBtn = document.getElementById('chooseCsv');
  const csvFileEl = document.getElementById('csvFile');
  const runBtn = document.getElementById('runBacktest');
  const loadSampleBtn = document.getElementById('loadSample');
  const rowsCountEl = document.getElementById('rowsCount');
  const lastTsEl = document.getElementById('lastTs');
  const limitWarnEl = document.getElementById('limitWarn');
  const tradeDownloadBtn = document.getElementById('downloadTrades');
  const statEquity = document.getElementById('stat-equity');
  const statReturn = document.getElementById('stat-return');
  const statCagr = document.getElementById('stat-cagr');
  const statSharpe = document.getElementById('stat-sharpe');
  const statDD = document.getElementById('stat-drawdown');
  const tradesBody = document.getElementById('tradesBody');
  const chartLoading = document.getElementById('chart-loading');

  // params
  const capitalEl = document.getElementById('capital');
  const smaShortEl = document.getElementById('smaShort');
  const smaLongEl = document.getElementById('smaLong');
  const slippageEl = document.getElementById('slippage');
  const commissionEl = document.getElementById('commission');

  // charts
  const quantCanvas = document.getElementById('quantChart');
  const equityCanvas = document.getElementById('equityChart');
  let priceChart = null, equityChart = null;

  // data holders
  let ohlc = []; // {t:Date,open,high,low,close,vol}
  let trades = [];
  let equitySeries = [];

  // helpers
  function parseCSV(text){
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    if(lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const idx = (name) => headers.indexOf(name);
    const dtIdx = idx('timestamp') !== -1 ? idx('timestamp') : (idx('time')!==-1?idx('time'):0);
    const oIdx = idx('open'), hIdx = idx('high'), lIdx = idx('low'), cIdx = idx('close'), vIdx = idx('volume');

    const rows = lines.slice(1).map(r => {
      const cols = r.split(',').map(c=>c.trim());
      const t = new Date(cols[dtIdx]);
      const open = oIdx >= 0 ? parseFloat(cols[oIdx]) : parseFloat(cols[cIdx]||cols[dtIdx]);
      const high = hIdx >= 0 ? parseFloat(cols[hIdx]) : open;
      const low = lIdx >= 0 ? parseFloat(cols[lIdx]) : open;
      const close = cIdx >= 0 ? parseFloat(cols[cIdx]) : open;
      const vol = vIdx >= 0 ? parseFloat(cols[vIdx]) : 0;
      return { t, open, high, low, close, vol };
    }).filter(x=>x.t && !isNaN(x.close));
    return rows;
  }

  async function fetchMarketChart(coinId, days){
    // use CoinGecko market_chart (prices) then convert to daily/hourly bars
    // note: network errors or rate-limit may cause issues
    const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart?vs_currency=usd&days=${encodeURIComponent(days)}&interval=${days<=1?'hourly':'daily'}`;
    const res = await fetch(url);
    if(!res.ok) throw new Error('CoinGecko fetch failed: ' + res.status);
    const data = await res.json();
    // data.prices = [[ts,price],...]
    // We'll build OHLC by grouping by date bucket (UTC)
    const points = (data.prices || []).map(p => ({ t: new Date(p[0]), price: p[1] }));
    // group by day or hour:
    const groupBy = (d) => {
      if(days <= 1){
        return d.t.toISOString().slice(0,13); // YYYY-MM-DDTHH
      } else {
        return d.t.toISOString().slice(0,10); // YYYY-MM-DD
      }
    };
    const buckets = {};
    for(const p of points){
      const key = groupBy(p);
      if(!buckets[key]) buckets[key] = { t: p.t, open: p.price, high: p.price, low: p.price, close: p.price, vol:0 };
      else {
        buckets[key].high = Math.max(buckets[key].high, p.price);
        buckets[key].low = Math.min(buckets[key].low, p.price);
        buckets[key].close = p.price;
      }
    }
    const arr = Object.keys(buckets).sort().map(k => ({ t: new Date(buckets[k].t), ...buckets[k] }));
    return arr;
  }

  function sma(values, period){
    const out = new Array(values.length).fill(null);
    let sum = 0;
    for(let i=0;i<values.length;i++){
      sum += values[i];
      if(i >= period) sum -= values[i-period];
      if(i >= period-1) out[i] = sum / period;
    }
    return out;
  }

  function stddev(arr){
    const mean = arr.reduce((a,b)=>a+b,0)/arr.length;
    const v = Math.sqrt(arr.reduce((s,x)=>s + Math.pow(x-mean,2),0)/arr.length);
    return v;
  }

  function maxDrawdown(eqs){
    let peak = -Infinity, maxDD = 0;
    for(const e of eqs){
      if(e > peak) peak = e;
      const dd = (peak - e) / peak;
      if(dd > maxDD) maxDD = dd;
    }
    return maxDD;
  }

  // backtest: SMA crossover simple (all in / all out)
  function runBacktest(ohlc, params){
    trades = [];
    equitySeries = [];

    const closes = ohlc.map(r => r.close);
    const dates = ohlc.map(r => r.t);
    const short = sma(closes, params.smaShort);
    const long = sma(closes, params.smaLong);

    let position = 0; // number of coins
    let cash = params.capital;
    let lastEntryPrice = null;

    const equityByIndex = [];

    for(let i=0;i<closes.length-1;i++){ // use next-bar execution to avoid immediate lookahead
      const priceNow = closes[i];
      const nextPrice = closes[i+1] || closes[i];
      const dateNow = dates[i];

      // only trade if both indicators present
      if(short[i] !== null && long[i] !== null){
        // entry signal: short crosses above long
        if(position === 0 && short[i] > long[i]){
          // buy at nextPrice + slippage
          const entryPrice = nextPrice * (1 + params.slippage/100);
          const qty = (cash * (params.sizePercent/100)) / entryPrice; // fractional coins allowed
          if(qty > 0){
            const value = qty * entryPrice;
            const commission = value * (params.commission/100);
            cash -= (value + commission);
            position += qty;
            lastEntryPrice = entryPrice;
            trades.push({ side:'BUY', date: new Date(dates[i+1]||dateNow), price: entryPrice, size: qty, value, commission });
          }
        }

        // exit signal: short crosses below long
        if(position > 0 && short[i] < long[i]){
          const exitPrice = nextPrice * (1 - params.slippage/100);
          const value = position * exitPrice;
          const commission = value * (params.commission/100);
          cash += (value - commission);
          const pnl = (value - commission) - (position * lastEntryPrice + (position * lastEntryPrice * (params.commission/100)));
          trades.push({ side:'SELL', date: new Date(dates[i+1]||dateNow), price: exitPrice, size: position, value, commission, pnl });
          position = 0;
          lastEntryPrice = null;
        }
      }

      const equity = cash + position * nextPrice;
      equityByIndex.push({ t: dates[i+1] || dateNow, equity });
    }

    // finalize: if still position, mark-to-market at last close
    const lastPrice = closes[closes.length-1];
    const finalEquity = cash + position * lastPrice;
    equityByIndex.push({ t: dates[closes.length-1], equity: finalEquity });

    // compute metrics
    const startEquity = params.capital;
    const endEquity = finalEquity;
    const totalReturn = (endEquity / startEquity - 1) * 100;
    // approximate CAGR = (end/start)^(365/periodDays)-1
    const daysSpan = ( (equityByIndex[equityByIndex.length-1].t - equityByIndex[0].t) / (1000*60*60*24) ) || params.days;
    const cagr = Math.pow(endEquity / startEquity, 365 / Math.max(daysSpan,1)) - 1;

    // daily returns: compute percent returns of equity by day (resample to daily)
    const eqVals = equityByIndex.map(e => e.equity);
    const returns = [];
    for(let i=1;i<eqVals.length;i++){
      const r = (eqVals[i] / eqVals[i-1]) - 1;
      returns.push(r);
    }
    const avgDaily = returns.length ? returns.reduce((a,b)=>a+b,0)/returns.length : 0;
    const vol = returns.length ? stddev(returns) * Math.sqrt(252) : 0;
    const annRet = cagr;
    const sharpe = vol ? (annRet / vol) : 0;
    const maxDD = maxDrawdown(eqVals);

    // prepare trades with PnL percent for display
    const processedTrades = [];
    for(let i=0;i<trades.length;i++){
      const tr = trades[i];
      if(tr.side === 'SELL' && tr.pnl === undefined){
        // try to compute pnl by matching previous buys (simplified)
        tr.pnl = 0;
      }
      processedTrades.push(tr);
    }

    return {
      trades: processedTrades,
      equitySeries: equityByIndex,
      stats: {
        finalEquity: endEquity,
        totalReturn,
        cagr,
        sharpe,
        maxDrawdown: maxDD
      }
    };
  }

  // render charts
  function renderPriceChart(ohlc, trades){
    const labels = ohlc.map(r=>r.t);
    const prices = ohlc.map(r=>r.close);
    const buySeries = trades.filter(t=>t.side==='BUY').map(t=>({x:t.date, y:t.price}));
    const sellSeries = trades.filter(t=>t.side==='SELL').map(t=>({x:t.date, y:t.price}));

    if(priceChart) priceChart.destroy();
    priceChart = new Chart(quantCanvas.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label:'Price', data: prices, borderColor:'#5ee7ff', backgroundColor:'rgba(94,231,255,0.06)', tension:0.2, pointRadius:0 },
          { label:'Buy', data: buySeries, type:'scatter', pointStyle:'triangle', pointRadius:8, backgroundColor:'#16a34a' },
          { label:'Sell', data: sellSeries, type:'scatter', pointStyle:'rectRot', pointRadius:8, backgroundColor:'#ef4444' }
        ]
      },
      options:{
        parsing: false,
        normalized: true,
        scales:{ x:{ type:'time', time:{ tooltipFormat:'yyyy-MM-dd HH:mm' } }, y:{ beginAtZero:false } },
        plugins:{ legend:{ display:true } },
        interaction:{ mode:'nearest', axis:'x', intersect:false },
        maintainAspectRatio:false,
      }
    });
  }

  function renderEquityChart(equitySeries){
    const labels = equitySeries.map(e=>e.t);
    const values = equitySeries.map(e=>e.equity);
    if(equityChart) equityChart.destroy();
    equityChart = new Chart(equityCanvas.getContext('2d'), {
      type:'line',
      data: { labels, datasets: [{ label:'Equity', data: values, borderColor:'#ffd166', backgroundColor:'rgba(255,209,102,0.08)', tension:0.2, pointRadius:0 }] },
      options:{
        parsing:false,
        normalized:true,
        scales:{ x:{ type:'time' }, y:{ beginAtZero:false } },
        maintainAspectRatio:false
      }
    });
  }

  function renderTradesTable(trades){
    tradesBody.innerHTML = '';
    for(const tr of trades){
      const trEl = document.createElement('tr');
      const pnlText = tr.pnl !== undefined ? (tr.pnl>=0?`+$${tr.pnl.toFixed(2)}`:`-$${Math.abs(tr.pnl).toFixed(2)}`) : '--';
      trEl.innerHTML = `<td>${tr.side}</td><td>${new Date(tr.date).toLocaleString()}</td><td>$${tr.price.toFixed(4)}</td><td>${(tr.size||0).toFixed(6)}</td><td>$${(tr.value||0).toFixed(2)}</td><td>${pnlText}</td>`;
      tradesBody.appendChild(trEl);
    }
  }

  function updateStats(stats){
    statEquity.textContent = `$${Number(stats.finalEquity).toLocaleString(undefined,{maximumFractionDigits:2})}`;
    statReturn.textContent = `${stats.totalReturn.toFixed(2)}%`;
    statCagr.textContent = `${(stats.cagr*100).toFixed(2)}%`;
    statSharpe.textContent = `${stats.sharpe ? stats.sharpe.toFixed(2) : '—'}`;
    statDD.textContent = `${(stats.maxDrawdown*100).toFixed(2)}%`;
  }

  // CSV export helpers
  function downloadCSV(filename, rows){
    const csv = rows.join('\n');
    const blob = new Blob([csv], {type:'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  // wiring
  chooseCsvBtn.addEventListener('click', ()=> csvFileEl.click());
  csvFileEl.addEventListener('change', (e)=>{
    const f = e.target.files[0];
    if(!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      try{
        const parsed = parseCSV(fr.result);
        if(!parsed.length) throw new Error('No rows parsed');
        ohlc = parsed;
        rowsCountEl.textContent = ohlc.length;
        lastTsEl.textContent = ohlc[ohlc.length-1].t.toLocaleString();
        if(ohlc.length > 10000) limitWarnEl.style.display = 'block'; else limitWarnEl.style.display = 'none';
        alert('CSV loaded: ' + ohlc.length + ' rows');
      }catch(err){
        alert('CSV parse failed: ' + err.message);
      }
    };
    fr.readAsText(f);
  });

  loadSampleBtn.addEventListener('click', async ()=>{
    chartLoading.style.display = 'block';
    try{
      const arr = await fetchMarketChart('bitcoin', 30);
      ohlc = arr;
      rowsCountEl.textContent = ohlc.length;
      lastTsEl.textContent = ohlc[ohlc.length-1].t.toLocaleString();
      limitWarnEl.style.display = ohlc.length > 5000 ? 'block' : 'none';
      alert('Sample BTC 30d loaded (' + ohlc.length + ' rows)');
    }catch(err){
      alert('Sample load failed: ' + err.message);
    }finally{ chartLoading.style.display = 'none'; }
  });

  runBtn.addEventListener('click', async ()=>{
    // prepare data (source)
    const source = sourceEl.value;
    if(source === 'coingecko'){
      chartLoading.style.display = 'block';
      try{
        const coin = coinIdEl.value.trim() || 'bitcoin';
        const days = Number(daysEl.value) || 30;
        ohlc = await fetchMarketChart(coin, days);
        rowsCountEl.textContent = ohlc.length;
        lastTsEl.textContent = ohlc[ohlc.length-1].t.toLocaleString();
      }catch(err){
        alert('Failed to fetch market data: ' + err.message);
        chartLoading.style.display = 'none';
        return;
      } finally {
        chartLoading.style.display = 'none';
      }
    } else {
      if(!ohlc.length) { alert('Upload CSV first'); return; }
    }

    if(!ohlc.length){ alert('No data loaded'); return; }

    // run backtest
    const params = {
      capital: Number(capitalEl.value) || 10000,
      smaShort: Number(smaShortEl.value) || 9,
      smaLong: Number(smaLongEl.value) || 21,
      slippage: Number(slippageEl.value) || 0.1, // percent
      commission: Number(commissionEl.value) || 0.05, // percent
      sizePercent: 100, // all-in (for now)
      days: Number(daysEl.value) || 30
    };

    const result = runBacktest(ohlc, params);

    trades = result.trades || [];
    equitySeries = result.equitySeries || [];

    renderPriceChart(ohlc, trades);
    renderEquityChart(equitySeries);
    renderTradesTable(trades);
    updateStats(result.stats);

    // enable download
    tradeDownloadBtn.disabled = false;
    tradeDownloadBtn.onclick = () => {
      const header = 'side,date,price,size,value,commission,pnl\n';
      const rows = [header].concat(trades.map(t => `${t.side},${new Date(t.date).toISOString()},${t.price},${t.size||''},${t.value||''},${t.commission||''},${t.pnl||''}`));
      downloadCSV('trades.csv', rows);
      // equity csv
      const eqRows = ['timestamp_iso,equity'].concat(equitySeries.map(e => `${new Date(e.t).toISOString()},${e.equity}`));
      downloadCSV('equity.csv', eqRows);
    };
  });

})();
