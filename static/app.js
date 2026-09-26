const $ = selector => document.querySelector(selector);
const money = paise => '₹' + (Number(paise) / 100).toLocaleString('en-IN', {maximumFractionDigits: 2});
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const title = value => ({needs_attention:'Needs attention',needs_funding:'Awaiting funds',booked:'Booked',picked_up:'Picked up',in_transit:'In transit',out_for_delivery:'Out for delivery',awaiting_confirmation:'Awaiting customer',completed:'Completed',disputed:'Payout held',refunded:'Refunded'}[value] || value);
let catalog, dashboard, selectedOrder = null, productId, checkoutRequest, editingPartner, customerToken, customerOrder, routeVersion = 0;
const drawings = {
  bag: `<svg viewBox="0 0 240 250" role="img" aria-label="Olive canvas weekender bag"><defs><linearGradient id="bagshade" x2="1" y2="1"><stop stop-color="#98a17d"/><stop offset="1" stop-color="#68775a"/></linearGradient></defs><ellipse cx="120" cy="224" rx="79" ry="9" fill="#405036" opacity=".08"/><path d="M74 92V65Q74 27 98 28Q122 27 122 66V85M118 85V66Q118 28 143 29Q167 28 167 66V92" fill="none" stroke="#5c674d" stroke-width="9"/><path d="M40 85Q119 70 200 85L210 208Q120 234 29 209Z" fill="url(#bagshade)"/><path d="M40 85L50 201Q122 222 199 202L200 85" fill="none" stroke="#aeb699" stroke-width="2"/><path d="M75 85L77 190M166 85L165 190" stroke="#526148" stroke-width="12"/><path d="M68 149Q120 141 173 149L173 199Q121 216 68 198Z" fill="#7d8c6a" stroke="#627451"/><path d="M68 150Q120 142 173 150" stroke="#b0b998" stroke-width="2"/><rect x="103" y="162" width="35" height="22" rx="2" fill="#dbcfaf"/><text x="120" y="176" text-anchor="middle" font-size="6" fill="#65634c" font-family="sans-serif">everyday.</text></svg>`,
  bottle: `<svg viewBox="0 0 240 250" role="img" aria-label="Terracotta reusable water bottle"><defs><linearGradient id="bottleshade" x2="1"><stop stop-color="#ac7055"/><stop offset=".45" stop-color="#ca9273"/><stop offset="1" stop-color="#a4674f"/></linearGradient></defs><ellipse cx="121" cy="232" rx="43" ry="7" fill="#784930" opacity=".1"/><rect x="95" y="22" width="52" height="28" rx="8" fill="#5b5548"/><path d="M102 21V16Q120 2 138 16V22" fill="none" stroke="#5b5548" stroke-width="5"/><path d="M94 45H147L159 73V213Q159 231 141 231H100Q83 230 83 213V74Z" fill="url(#bottleshade)"/><path d="M95 58L92 77V210" fill="none" stroke="#dba68b" stroke-width="3" opacity=".55"/><text x="121" y="139" text-anchor="middle" transform="rotate(-90 121 139)" font-size="12" fill="#efe1cc" font-family="sans-serif" letter-spacing="1">everyday.</text><path d="M94 49H146" stroke="#8f5e49" stroke-width="3"/></svg>`,
  lamp: `<svg viewBox="0 0 240 250" role="img" aria-label="Cream dome table lamp"><defs><linearGradient id="lampshade" x2="1" y2=".5"><stop stop-color="#e5dac6"/><stop offset=".45" stop-color="#f8eedb"/><stop offset="1" stop-color="#c9bda7"/></linearGradient></defs><ellipse cx="119" cy="232" rx="65" ry="8" fill="#68635a" opacity=".1"/><path d="M172 223Q218 219 224 238" fill="none" stroke="#8f8b7e" stroke-width="3"/><path d="M108 116H133V210H108Z" fill="#c3b49d"/><ellipse cx="120" cy="217" rx="59" ry="13" fill="#c5b7a0"/><ellipse cx="120" cy="214" rx="58" ry="12" fill="url(#lampshade)"/><path d="M35 126Q43 30 120 29Q196 29 206 126Z" fill="url(#lampshade)"/><ellipse cx="120" cy="125" rx="85" ry="10" fill="#c9b89c"/><ellipse cx="120" cy="126" rx="71" ry="6" fill="#f4deb2"/><path d="M56 96Q70 50 106 43" stroke="#fff8e9" opacity=".4" stroke-width="3" fill="none"/></svg>`
};
async function api(path, data) {
  const response = await fetch('/api/' + path, {cache:'no-store', ...(data ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)} : {})});
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Something went wrong. Please try again.');
  return body;
}
function toast(message) {$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,5000);}
function closeDialogs() {document.querySelectorAll('dialog[open]').forEach(d=>d.close());}
function renderProducts() {
  $('#products').innerHTML=catalog.products.map((p,i)=>`<article class="product"><div class="product-art ${esc(p.color)}"><span class="tag">${['A carry-everywhere classic','Your daily companion','A softer kind of evening'][i]}</span>${drawings[p.id]}</div><div class="product-info"><span class="eyebrow">${esc(p.category)}</span><div class="product-name"><h3>${esc(p.name)}</h3><strong>${money(p.price)}</strong></div><p>${esc(p.description)}</p><button data-buy="${p.id}">Make it yours <span>↗</span></button></div></article>`).join('');
  $('#checkout-city').innerHTML=catalog.cities.map(city=>`<option>${esc(city)}</option>`).join('');
  $('#checkout-city').value='Bengaluru';
  $('#excluded-cities').innerHTML=catalog.cities.map(city=>`<option>${esc(city)}</option>`).join('');
}
function openCheckout(id) {
  const p=catalog.products.find(p=>p.id===id);productId=id;checkoutRequest=crypto.randomUUID();
  $('#checkout-form').reset();$('#checkout-city').value='Bengaluru';$('#checkout-error').textContent='';
  $('#checkout-product').innerHTML=`<div class="checkout-item"><div><b>${esc(p.name)}</b><small>${money(p.price)} each · Delivery arranged by the store</small></div><label>Qty<select name="quantity" id="quantity">${[1,2,3,4,5].map(n=>`<option>${n}</option>`).join('')}</select></label></div>`;
  $('#checkout-total').textContent=money(p.price);$('#checkout').showModal();
}
async function loadDashboard() {dashboard=await api('platform');if(!selectedOrder || !dashboard.orders.some(o=>o.id===selectedOrder))selectedOrder=dashboard.orders[0]?.id;}
function renderPlatform() {
  const w=dashboard.wallets;
  $('#wallets').innerHTML=[['Company wallet',w.company,'Available for delivery','↗'],['Held in escrow',w.escrow,'Awaiting customer confirmation','◇'],['Partner payouts',w['partner:A']+w['partner:B']+w['partner:C'],'Released after receipt','✓']].map(([name,value,note,icon])=>`<div class="wallet"><div class="wallet-label"><span>${name}</span><span>${icon}</span></div><strong>${money(value)}</strong><small>${note} · demo credits</small></div>`).join('');
  $('#order-count').textContent=dashboard.orders.length;
  $('#order-list').innerHTML=dashboard.orders.map(o=>`<button class="order-tab ${selectedOrder===o.id?'active':''}" data-order="${o.id}"><b>${o.id}</b><small>${esc(o.origin)} → ${esc(o.destination)}<br>${title(o.status)}</small></button>`).join('') || '<p class="history-note">Confirmed store orders appear here automatically.</p>';
  const o=dashboard.orders.find(o=>o.id===selectedOrder);
  if(!o){$('#order-detail').innerHTML='<div class="panel empty"><div class="orbit">✳</div><span class="eyebrow">READY WHEN YOU ARE</span><h2>Start with a real demo order.</h2><p>Buy an item in the store to watch your delivery agents<br>negotiate, choose a partner and secure payment.</p><a href="#shop" class="primary button-link">Go to the store →</a></div>';return;}
  const c=o.contract, winner=o.winner, locked=c&&['funded','disputed'].includes(c.state), paid=c?.state==='released';
  const progress=[true,!!winner,!!c&&c.state!=='created',paid];
  const stageNames=['Booked','Picked up','In transit','Out for delivery','Delivery reported'];
  $('#order-detail').innerHTML=`<article class="panel"><div class="detail-top"><div><span class="eyebrow">${o.id}</span><h2>${esc(o.origin)} → ${esc(o.destination)}</h2><p>${o.items.map(i=>`${i.quantity} × ${esc(i.name)}`).join(', ')} · ${o.weight} kg</p></div><span class="badge ${['disputed','needs_attention','needs_funding'].includes(o.status)?'alert':''}">${title(o.status)}</span></div>
  <div class="journey">${['Order received','Partner selected','Payment secured','Delivered & paid'].map((s,i)=>`<div class="${progress[i]?'done':''}">${progress[i]?'●':'○'} ${s}</div>`).join('')}</div>
  ${winner?`<div class="winner"><div><span class="eyebrow">YOUR AGENTS FOUND A DEAL</span><h3>${esc(winner.name)}</h3><p>Within your budget and deadline.<br>${(winner.ontime*100).toFixed(1)}% on time · ${(1+winner.quality*4).toFixed(1)}/5 parcel care</p></div><div class="winner-price"><strong>${money(winner.pricePaise)}</strong><small>${winner.days} days · shipping only</small><small>${money(winner.openingPrice-winner.pricePaise)} negotiated saving</small></div></div>`:'<div class="notice error-panel"><b>No deal meets your rules.</b><br>No payment was taken. Review the company budget, deadline and connected partners before placing a new order.</div>'}
  <details><summary>See partner offers & negotiation</summary><p class="history-note">Policy agents made three rounds of offers. These are local simulations, not live carrier quotes or LLM conversations.</p><div class="offers">${o.offers.map(p=>`<div class="offer ${p.id===winner?.id?'chosen':''}"><b>${esc(p.name)} ${p.id===winner?.id?'✓':''}</b><strong>${money(p.pricePaise)}</strong><del>${money(p.openingPrice)}</del><small>${p.days} days · ${(p.reliability*100).toFixed(1)}% reliability<br>${p.score}/100 match · ${p.routeReviews} route reviews</small></div>`).join('')}</div>${o.excluded.map(p=>`<p class="status-note">${esc(p.name)}: ${esc(p.reason)}</p>`).join('')}<div class="events">${o.events.filter(e=>['offer','counter','declined','selected'].includes(e.kind)).map(eventHTML).join('')}</div><p class="history-note">Score balances normalized cost, speed, reliability and parcel care using the company priority. Reliability = 60% on-time + 40% successful deliveries. Historical evidence equivalent to 40 deliveries smooths feedback; matching-route feedback has full weight, other routes 20%.</p></details>
  ${c?`<div class="detail-section"><h3>${paid?'Payment delivered, too.':c.state==='refunded'?'Payment returned to the store.':'Protected until the parcel arrives.'}</h3><div class="escrow-line"><div><b>Company wallet</b><small>Shipping payer</small></div><span class="flow-arrow">→</span><div class="locked"><b>${money(c.terms.amount)}</b><small>${esc(c.state)} · simulated escrow</small></div><span class="flow-arrow">→</span><div><b>${esc(winner.name)}</b><small>${paid?'Payout complete':'Payout pending'}</small></div></div><p>${paid?'The customer confirmed receipt. The agreed amount has moved from escrow to the partner wallet.':c.state==='disputed'?'The customer reported an issue. Funds stay held until the demo company issues a refund.':c.state==='refunded'?'The held delivery payment has been refunded. This partner received no payout.':'The delivery company reports arrival; the customer confirms receipt. Only then can payment be released.'}</p>
  <div class="escrow-actions"><a class="text-link" href="#track=${o.customerToken}">Open customer tracking ↗</a>${o.status==='needs_funding'?`<button class="secondary" data-action="fund" data-id="${o.id}">Retry escrow funding</button>`:''}${(c.state==='disputed'||(c.state==='funded'&&Date.now()>Date.parse(c.terms.expiresAt)))?`<button class="secondary" data-action="refund" data-id="${o.id}">Refund company wallet</button>`:''}</div>
  ${locked&&c.state==='funded'&&o.stage<4?`<details class="demo-controls"><summary>Try the delivery demo</summary><p>Current stage: ${stageNames[o.stage]}. Simulate the selected partner’s next tracking update.</p><button class="secondary" data-action="advance" data-id="${o.id}">${['Simulate pickup','Move to in transit','Send out for delivery','Report parcel delivered'][o.stage]} →</button></details>`:''}
  <details><summary>View simulated contract & transactions</summary><div class="technical"><b>${c.id}</b><br>Simulation only · No blockchain deployment<br>Terms hash: <code>${c.termsHash}</code><br>Amount: ${money(c.terms.amount)} · State: ${esc(c.state)}<br>Deadline with grace period: ${new Date(c.terms.expiresAt).toLocaleString()}<br>Release: ${esc(c.terms.releaseRule)}<br>Disputes: ${esc(c.terms.disputeRule)}</div>${dashboard.ledger.filter(t=>t.order_id===o.id).map(t=>`<div class="ledger-row"><div><b>${esc(t.action)} · ${esc(t.sender)} → ${esc(t.receiver)}</b><small>${t.id} · simulated transaction</small></div><strong>${money(t.amount)}</strong></div>`).join('')}<p class="history-note">The escrow rules are enforced by the local simulator. Customer confirmation is the demo’s delivery proof; this is not a fully trustless or on-chain system.</p></details></div>`:`<a class="text-link" href="#connections">Review shipping policies →</a>`}
  <details class="detail-section"><summary>Order details & activity</summary><div class="technical"><b>Pickup</b><br>${esc(o.sellerAddress.line1)}, ${esc(o.origin)} ${esc(o.sellerAddress.postalCode)}<br><b>Deliver to</b><br>${esc(o.customerName)} · ${esc(o.customerAddress.line1)}, ${esc(o.destination)} ${esc(o.customerAddress.postalCode)}<br><b>Parsed parcel</b><br>${o.weight} kg · ${o.length} × ${o.width} × ${o.height} cm<br>Budget: ${money(o.policy.maxShipping)} · Deadline: ${o.policy.maxDays} days · Priority: ${esc(o.policy.priority)}</div><div class="events">${o.events.filter(e=>!['offer','counter'].includes(e.kind)).map(eventHTML).join('')}</div></details></article>`;
}
function eventHTML(event) {return `<div class="event"><b>${esc(event.actor)}</b><small>${new Date(event.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</small><p>${esc(event.text)}</p></div>`;}
function renderConnections() {
  const c=dashboard.config.company;
  $('#company-settings').innerHTML=`<section class="panel company-card"><div><span class="eyebrow">COMPANY CONNECTION</span><h2>${esc(c.name)}</h2><span class="badge">● Sandbox connected</span><p>Your confirmed orders start the process automatically. Set the warehouse address and the maximum delivery price your agent may accept.</p><p>Wallet: <b>${money(dashboard.wallets.company)}</b> demo credits</p></div><form id="company-form"><div class="form-grid"><label>Company name<input name="name" value="${esc(c.name)}" maxlength="60" required></label><label>Warehouse city<select name="city">${catalog.cities.map(city=>`<option ${city===c.address.city?'selected':''}>${esc(city)}</option>`).join('')}</select></label><label class="full">Warehouse street address<input name="line1" value="${esc(c.address.line1)}" minlength="5" maxlength="180" required></label><label>PIN code<input name="postalCode" value="${esc(c.address.postalCode)}" pattern="[0-9]{6}" required></label><label>Shipping priority<select name="priority">${[['balanced','Best balance'],['price','Lower price'],['speed','Faster delivery'],['reliability','Reliability & care']].map(([value,label])=>`<option value="${value}" ${c.priority===value?'selected':''}>${label}</option>`).join('')}</select></label><label>Max. shipping price (₹)<input name="maxShipping" type="number" value="${c.maxShipping/100}" min="1" max="1000" step=".01" required></label><label>Max. delivery days<input name="maxDays" type="number" value="${c.maxDays}" min="1" max="14" required></label><label class="full">Replace sandbox API key<input name="apiKey" type="password" autocomplete="new-password" minlength="16" maxlength="200" placeholder="Leave blank to keep the current key"><small>Used to authenticate confirmed-order webhooks. Use sandbox credentials only.</small></label></div><button class="primary full-button" type="submit">Save company settings</button><p id="company-error" class="form-error" role="alert"></p></form></section>`;
  $('#partner-settings').innerHTML=dashboard.config.partners.map(p=>`<article class="panel"><div class="partner-logo">${p.id}</div><h3>${esc(p.name)}</h3><p>${esc(p.tag)}</p><span class="badge ${p.enabled?'':'alert'}">${p.enabled?'● Connected':'Paused'}</span><div class="policy-line"><span>Price floor</span><b>${money(p.minPrice)}</b></div><div class="policy-line"><span>Max. concession</span><b>${p.maxDiscount}%</b></div><div class="policy-line"><span>Transit promise</span><b>${p.deliveryDays || ({A:4,B:2,C:3}[p.id])} days</b></div><div class="policy-line"><span>Weight policy</span><b>${p.maxWeight} kg</b></div><div class="policy-line"><span>Wallet received</span><b>${money(dashboard.wallets[p.wallet])}</b></div><button class="secondary" data-policy="${p.id}">Edit agent policy</button></article>`).join('');
}
function openPolicy(id) {
  editingPartner=id;const p=dashboard.config.partners.find(p=>p.id===id),f=$('#partner-form');
  f.reset();$('#partner-error').textContent='';$('#partner-title').textContent=p.name;
  for(const key of ['minPrice','maxDiscount','maxWeight','enabled','deliveryDays'])f.elements[key].value=key==='minPrice'?p[key]/100:String(p[key] ?? ({A:4,B:2,C:3}[id]));
  Array.from(f.elements.excludedCities.options).forEach(option=>option.selected=p.excludedCities.includes(option.value));
  $('#partner-dialog').showModal();
}
async function loadCustomer() {
  customerOrder=await api('tracking/'+encodeURIComponent(customerToken));const o=customerOrder;
  const stages=['Confirmed','Picked up','In transit','Out for delivery','Arrived'];
  const state=o.status;
  const heading=state==='completed'?'All delivered. All settled.':state==='disputed'?'We’ve put the payment on hold.':state==='refunded'?'The delivery payment was refunded.':state==='awaiting_confirmation'?'Did your parcel arrive?':state==='needs_attention'?'The store is finding a delivery option.':state==='needs_funding'?'The store is arranging delivery.':'Your parcel’s journey';
  const message=state==='completed'?'Thanks for confirming. The delivery partner has now been paid from simulated escrow.':state==='awaiting_confirmation'?'Your delivery partner has reported arrival. Confirm you received the parcel to release the store’s simulated delivery payment. If something is wrong, report it to hold payment.':state==='disputed'?'Your issue has been recorded. The store can review it and return the held delivery payment.':state==='refunded'?'The store received its delivery payment back. You can still tell us about your delivery experience.':state==='needs_attention'||state==='needs_funding'?'There is no action needed from you right now. Check back for an update.':'We’ll show each update as your parcel makes its way to you.';
  $('#customer-detail').innerHTML=`<article class="panel tracking-card"><div class="detail-top"><div><span class="eyebrow">${o.id}</span><h2>${esc(o.origin)} → ${esc(o.destination)}</h2><p>${o.winner?`${esc(o.winner.name)} · Estimated transit ${o.winner.days} days`:'Delivery partner pending'}</p></div><span class="badge">${title(state)}</span></div><div class="journey">${stages.map((name,i)=>`<div class="${i<=o.stage?'done':''}">${i<=o.stage?'●':'○'} ${name}</div>`).join('')}</div>${o.items.map(i=>`<div class="tracking-items"><b>${esc(i.name)}</b><small>Quantity ${i.quantity}</small></div>`).join('')}<div class="tracking-message"><h3>${heading}</h3><p>${message}</p>${state==='awaiting_confirmation'?'<button class="primary" data-customer="confirm">Yes, I received my parcel</button><button class="secondary" data-customer="dispute">There’s a delivery issue</button>':''}${o.stage===4&&!o.feedback?'<button class="text-button" id="open-feedback">Rate this delivery</button>':''}${o.feedback?'<p>✓ Thank you. Your feedback has been saved.</p>':''}</div><button class="text-button" id="refresh-customer" style="margin-top:22px">Refresh tracking ↻</button></article>`;
}
async function route() {
  const version=++routeVersion;const hash=location.hash.slice(1)||'shop';const customer=hash.startsWith('track=');const page=customer?'customer':['shop','platform','connections'].includes(hash)?hash:'shop';
  closeDialogs();document.body.classList.toggle('customer-mode',customer);
  ['shop','platform','connections','customer'].forEach(id=>$('#'+id).hidden=id!==page);
  document.querySelectorAll('[data-nav]').forEach(link=>link.classList.toggle('active',link.dataset.nav===page));
  window.scrollTo(0,0);
  try {
    if(page==='platform'||page==='connections'){await loadDashboard();if(version!==routeVersion)return;page==='platform'?renderPlatform():renderConnections();}
    if(page==='customer'){customerToken=hash.slice(6);$('#customer-detail').innerHTML='<div class="panel empty">Loading your delivery…</div>';await loadCustomer();}
  } catch(error) {
    if(page==='customer')$('#customer-detail').innerHTML='<div class="notice">We couldn’t load that delivery. Check your link and try again.</div>';
    toast(error.message);
  }
}
document.addEventListener('click',async event=>{
  const b=event.target.closest('button');if(!b)return;
  if(b.dataset.close){$('#'+b.dataset.close).close();return;}
  if(b.dataset.buy){openCheckout(b.dataset.buy);return;}
  if(b.dataset.order){selectedOrder=b.dataset.order;renderPlatform();return;}
  if(b.dataset.policy){openPolicy(b.dataset.policy);return;}
  if(b.id==='success-platform'){$('#order-success').close();location.hash='platform';return;}
  if(b.id==='open-feedback'){$('#feedback-form').reset();$('#feedback-dialog').showModal();return;}
  if(b.type==='submit' && b.form)return;
  b.disabled=true;
  try {
    if(b.id==='refresh-platform'){await loadDashboard();renderPlatform();}
    if(b.id==='refresh-customer')await loadCustomer();
    if(b.dataset.action){await api('demo/order-action',{id:b.dataset.id,action:b.dataset.action});await loadDashboard();renderPlatform();toast(b.dataset.action==='advance'?'Delivery updated.':b.dataset.action==='refund'?'Demo payment refunded.':'Demo escrow funded.');}
    if(b.dataset.customer){await api('tracking-action',{id:customerOrder.id,token:customerToken,action:b.dataset.customer});await loadCustomer();toast(b.dataset.customer==='confirm'?'Receipt confirmed. Partner payment released.':'Issue reported. Payment is on hold.');}
  }catch(error){toast(error.message);}finally{b.disabled=false;}
});
$('#checkout-form').addEventListener('input',()=>{
  checkoutRequest=crypto.randomUUID();const quantity=Number($('#quantity')?.value||1);$('#checkout-total').textContent=money(catalog.products.find(p=>p.id===productId).price*quantity);
});
document.addEventListener('submit',async event=>{
  const form=event.target;if(!['checkout-form','company-form','partner-form','feedback-form'].includes(form.id))return;
  event.preventDefault();const button=event.submitter;button.disabled=true;const data=Object.fromEntries(new FormData(form));
  try {
    if(form.id==='checkout-form'){
      $('#checkout-error').textContent='';button.textContent='Confirming your order…';
      const result=await api('demo/checkout',{productId,quantity:Number(data.quantity),customerName:data.customerName,address:{line1:data.line1,city:data.city,postalCode:data.postalCode},requestId:checkoutRequest});
      selectedOrder=result.id;$('#checkout').close();$('#success-summary').textContent=result.id+' · '+title(result.status);$('#success-track').href='#track='+result.customerToken;$('#order-success').showModal();
    }
    if(form.id==='company-form'){
      $('#company-error').textContent='';
      await api('connections',{id:'company',apiKey:data.apiKey,config:{name:data.name,address:{line1:data.line1,city:data.city,postalCode:data.postalCode},priority:data.priority,maxShipping:Math.round(Number(data.maxShipping)*100),maxDays:Number(data.maxDays)}});
      await loadDashboard();renderConnections();toast('Company settings saved. They apply to new orders.');
    }
    if(form.id==='partner-form'){
      $('#partner-error').textContent='';
      await api('connections',{id:'partner:'+editingPartner,apiKey:data.apiKey,config:{enabled:data.enabled==='true',deliveryDays:Number(data.deliveryDays),minPrice:Math.round(Number(data.minPrice)*100),maxDiscount:Number(data.maxDiscount),maxWeight:Number(data.maxWeight),excludedCities:Array.from(form.elements.excludedCities.selectedOptions,option=>option.value)}});
      $('#partner-dialog').close();await loadDashboard();renderConnections();toast('Partner policy saved for future negotiations.');
    }
    if(form.id==='feedback-form'){
      await api('tracking-action',{id:customerOrder.id,token:customerToken,action:'feedback',rating:Number(data.rating),ontime:data.ontime==='true',success:data.success==='true'});
      $('#feedback-dialog').close();await loadCustomer();toast('Thank you. Future delivery recommendations will use this feedback.');
    }
  }catch(error){const target={'checkout-form':'checkout-error','company-form':'company-error','partner-form':'partner-error'}[form.id];if(target)$('#'+target).textContent=error.message;else toast(error.message);}
  finally {button.disabled=false;if(form.id==='checkout-form')button.textContent='Confirm demo order →';}
});
window.addEventListener('hashchange',route);
(async()=>{try{catalog=await api('catalog');renderProducts();await route();}catch(error){$('#products').innerHTML='<div class="notice">The store couldn’t load. Check that the local server is running, then refresh.</div>';toast(error.message);}})();
