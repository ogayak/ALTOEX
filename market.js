/* Market page logic: persistent search + periodic refresh that pauses while searching */
(function(){
  const listEl = document.getElementById('market-list');
  if(!listEl) return;

  const searchInput = document.getElementById('search');
  const currencySel = document.getElementById('fiat');
  const statusEl = document.getElementById('status');
  let dataset = [];     // full set from API
  let filtered = [];    // view
  let page = 1;         // pagination could be added later
  let timer = null;

  // restore search from URL or localStorage
  const urlParams = new URLSearchParams(location.search);
  const initialQ = urlParams.get('q') || localStorage.getItem('marketSearch') || '';
  const initialFiat = urlParams.get('vs') || localStorage.getItem('marketFiat') || 'usd';
  searchInput.value = initialQ;
  currencySel.value = initialFiat;

  async function fetchMarket(){
    status('Loading market…');
    try{
      const vs = currencySel.value;
      const res = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=${encodeURIComponent(vs)}&order=market_cap_desc&per_page=200&page=${page}&sparkline=false&price_change_percentage=24h`);
      const data = await res.json();
      dataset = Array.isArray(data) ? data : [];
      filterAndRender();
      status('');
    }catch(e){
      console.error(e);
      status('Failed to load. Pull to refresh.');
    }
  }

  function status(msg){ if(statusEl) statusEl.textContent = msg; }

  function renderRows(rows){
    const vs = currencySel.value.toUpperCase();
    const isMobile = window.innerWidth < 700;
    if(isMobile){
      listEl.innerHTML = rows.map(r=>`
        <div class="row" data-id="${r.id}">
          <div class="cell"><span class="label">Coin</span><span>${r.market_cap_rank}. <img src="${r.image}" alt="" style="width:18px;height:18px;border-radius:50%;vertical-align:-3px"> ${r.name} (${r.symbol.toUpperCase()})</span></div>
          <div class="cell"><span class="label">Price</span><span>${fmt(r.current_price, vs)}</span></div>
          <div class="cell"><span class="label">24h</span><span style="color:${r.price_change_percentage_24h>=0?'#7efc7e':'#ff7b7b'}">${r.price_change_percentage_24h?.toFixed(2) ?? '--'}%</span></div>
        </div>
      `).join('');
    }else{
      listEl.innerHTML = `
        <table class="table">
          <thead><tr><th>#</th><th>Coin</th><th>Price (${vs})</th><th>24h</th><th>Market Cap</th></tr></thead>
          <tbody>
            ${rows.map(r=>`
              <tr data-id="${r.id}">
                <td>${r.market_cap_rank}</td>
                <td><img src="${r.image}" alt="" style="width:18px;height:18px;border-radius:50%;vertical-align:-3px"> ${r.name} <span style="opacity:.7">(${r.symbol.toUpperCase()})</span></td>
                <td>${fmt(r.current_price, vs)}</td>
                <td style="color:${r.price_change_percentage_24h>=0?'#7efc7e':'#ff7b7b'}">${r.price_change_percentage_24h?.toFixed(2) ?? '--'}%</td>
                <td>${fmt(r.market_cap, vs)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    // Row click -> coin page
    listEl.querySelectorAll('[data-id]').forEach(row=>{
      row.addEventListener('click', ()=>{
        const id = row.getAttribute('data-id');
        location.href = `coin.html?coin=${encodeURIComponent(id)}&vs=${encodeURIComponent(currencySel.value)}`;
      });
    });
  }

  function fmt(n, vs){ 
    if(n == null) return '--';
    const sym = vs === 'usd' ? '$' : vs === 'eur' ? '€' : vs === 'ngn' ? '₦' : '';
    const opts = {maximumFractionDigits: n < 1 ? 6 : 2};
    return sym + Number(n).toLocaleString(undefined, opts);
  }

  function filterAndRender(){
    const q = searchInput.value.trim().toLowerCase();
    filtered = q ? dataset.filter(r => r.name.toLowerCase().includes(q) || r.symbol.toLowerCase().includes(q)) : dataset;
    renderRows(filtered);
  }

  // Debounced search; persist query; pause auto-refresh while searching
  let searchTimer;
  searchInput.addEventListener('input', ()=>{
    const q = searchInput.value;
    localStorage.setItem('marketSearch', q);
    const url = new URL(location);
    if(q) url.searchParams.set('q', q); else url.searchParams.delete('q');
    history.replaceState(null,'',url);
    clearTimeout(searchTimer);
    searchTimer = setTimeout(filterAndRender, 120);
  });

  // Currency change
  currencySel.addEventListener('change', ()=>{
    localStorage.setItem('marketFiat', currencySel.value);
    const url = new URL(location);
    url.searchParams.set('vs', currencySel.value);
    history.replaceState(null,'',url);
    fetchMarket();
  });

  // Auto-refresh every 20s only if no active search text
  function autoRefresh(){
    clearInterval(timer);
    timer = setInterval(()=>{ if(!searchInput.value.trim()) fetchMarket(); }, 20000);
  }

  // init
  fetchMarket().then(autoRefresh);
})();
