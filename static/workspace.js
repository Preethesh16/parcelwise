const $=s=>document.querySelector(s), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>'₹'+(Number(v||0)/100).toLocaleString('en-IN',{maximumFractionDigits:2});
const labels={awaiting_seller:'Starting automatically',received:'Preparing negotiation',parsed:'Checking constraints',broadcasting:'Contacting partners',bidding:'Negotiating',awaiting_selection:'Selecting partner',deal_finalized:'Booking partner',contract_created:'Securing payment',booked:'Ready for pickup',picked_up:'Picked up',in_transit:'In transit',out_for_delivery:'Out for delivery',awaiting_confirmation:'Awaiting receipt',completed:'Completed',needs_attention:'No suitable offer',needs_funding:'Funding required',disputed:'Issue reported',refunded:'Refunded'};
const pending=['awaiting_seller','awaiting_selection','needs_attention','needs_funding'];
const active=['booked','picked_up','in_transit','out_for_delivery','awaiting_confirmation'];
let data, catalog, order, token, partnerId='A', routeVersion=0, timer, map, marker, lastSignature='', busy=false, search='', filter='all', formDirty=false;
async function api(path,body){const r=await fetch('/api/'+path,{cache:'no-store',headers:{'Content-Type':'application/json','X-Portal-Account':sessionStorage.getItem('parcelwiseAccount')||''},...(body?{method:'POST',body:JSON.stringify(body)}:{})});const d=await r.json();if(!r.ok){if(r.status===401&&!['login','session','tracking-action'].includes(path)&&!path.startsWith('tracking/'))location.hash='login='+(location.hash.includes('partner=')?'partner':'seller');throw Error(d.error||'Unable to complete the request');}return d;}
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,5000);}
const badge=s=>'<span class="badge '+(pending.includes(s)?'pending':['disputed','refunded'].includes(s)?'alert':'')+'">'+esc(labels[s]||s)+'</span>';
const kpi=(label,value,note)=>'<div class="kpi"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><em>'+esc(note)+'</em></div>';
const bar=(label,value,max=100,suffix='',color='')=>'<div class="bar-row"><span>'+esc(label)+'</span><div class="bar-track"><div class="bar-fill '+color+'" style="width:'+Math.max(0,Math.min(100,max?value/max*100:0))+'%"></div></div><b>'+esc(value)+suffix+'</b></div>';
const head=(eyebrow,title,desc,action='')=>'<div class="page-head"><div><div class="eyebrow">'+eyebrow+'</div><h1>'+title+'</h1><p>'+desc+'</p></div>'+action+'</div>';
const dates=v=>new Date(v).toLocaleDateString('en-IN',{day:'numeric',month:'short'});
function metrics(orders){const rated=orders.filter(o=>o.feedback);return {rated,done:orders.filter(o=>o.status==='completed').length,avg:rated.length?(rated.reduce((s,o)=>s+o.feedback.rating,0)/rated.length).toFixed(1):'—',ontime:rated.length?Math.round(rated.filter(o=>o.feedback.ontime).length/rated.length*100):null};}
function orderTable(orders,partner=false){return orders.length?'<div class="table-wrap"><table><thead><tr><th>Order / product</th><th>'+(partner?'Seller':'Customer')+'</th><th>Route</th><th>Status</th><th>'+(partner?'Promise':'Partner')+'</th><th></th></tr></thead><tbody>'+orders.map(o=>'<tr><td><b>'+esc(o.id)+'</b><small>'+esc(o.items.map(i=>i.quantity+' × '+i.name).join(', '))+'</small></td><td>'+esc(partner?(o.sellerName||'Everyday Store'):o.customerName)+'<small>'+dates(o.created)+'</small></td><td>'+esc(o.origin)+' → '+esc(o.destination)+'</td><td>'+badge(o.status)+'</td><td>'+(partner?money(o.winner.pricePaise)+' · '+o.winner.days+' days':esc(o.winner?.name||'Not selected'))+'</td><td><a class="btn secondary" href="#order='+o.id+(partner?'&partner='+partnerId:'')+'">'+(o.status==='awaiting_selection'?'Choose partner':'View order')+' →</a></td></tr>').join('')+'</tbody></table></div>':'<div class="empty">No orders in this view.</div>';}
let currentOrder=null,followDemo=true,lastDemoStage='',mapOrderId=null,mapStage=null;
function followStage(o){
 window.ParcelGuide?.update(o);
 const key=o?o.id+':'+o.status:'empty';
 if(key===lastDemoStage)return;
 const changed=!!lastDemoStage;lastDemoStage=key;
 if(!changed||!followDemo||typeof window.requestAnimationFrame!=='function')return;
 window.requestAnimationFrame(()=>{
  const target=o?.winner?(o.stage>0?$('.delivery-simulation'):$('.delivery-flow')):o&&['broadcasting','bidding'].includes(o.status)?$('.negotiation-chat'):($('.completion-feedback')||$('.classic-detail'));
  target?.scrollIntoView?.({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
 });
}

function renderSeller(){
 const latestCompleted=data.orders.filter(x=>x.status==='completed').sort((a,b)=>String(b.completedAt||b.created).localeCompare(String(a.completedAt||a.created)))[0];
 const finished=latestCompleted&&!latestCompleted.feedback?latestCompleted:null;
 const orders=data.orders.filter(o=>!['completed','refunded'].includes(o.status));
 if(currentOrder&&data.orders.some(o=>o.id===currentOrder&&o.status==='completed'))toast('Delivery demo complete. Escrow released. Order saved in Analytics.');
 if(!orders.some(o=>o.id===currentOrder))currentOrder=orders[0]?.id;
 const o=orders.find(o=>o.id===currentOrder);order=o;
 const oldSettlement=$('.settlement-scene');
 const retainedSettlement=oldSettlement?.dataset?.order===o?.id?oldSettlement:null;
 const retainedMap=map&&mapOrderId===o?.id?$('#delivery-map'):null;
 const oldChat=$('#agent-chat'),chatPosition=oldChat?.scrollTop||0,chatFollowing=!oldChat||oldChat.scrollHeight-oldChat.scrollTop-oldChat.clientHeight<80;
 if(!retainedMap)disposeMap();
 $('#workspace').innerHTML='<section class="classic-dashboard">'+head('PARCELWISE / COMPANY WORKSPACE','Orders in. Delivery sorted.','Your delivery agents handle the details. You stay in control.','<div class="actions"><button class="btn secondary" data-follow-demo aria-pressed="'+followDemo+'">Auto-follow: '+(followDemo?'On':'Off')+'</button><a class="btn secondary" href="#connections">Shipping defaults</a></div>')+
 '<div class="platform-layout"><aside class="order-sidebar"><div class="sidebar-heading"><h3>Current orders</h3><span>'+orders.length+'</span></div><div class="order-list">'+orders.map(x=>'<button class="order-tab '+(x.id===currentOrder?'active':'')+'" data-current-order="'+esc(x.id)+'" aria-pressed="'+(x.id===currentOrder)+'"><b>'+esc(x.id)+'</b><small>'+esc(x.origin)+' → '+esc(x.destination)+'<br>'+esc(labels[x.status]||x.status)+'</small></button>').join('')+'</div><a href="'+esc(storefrontUrl)+'/shop" class="text-link">Create a demo order +</a></aside><div class="classic-detail">'+
 (o?'<article class="panel"><div class="detail-top"><div><span class="eyebrow">'+esc(o.id)+'</span><h2>'+esc(o.origin)+' → '+esc(o.destination)+'</h2><p>'+esc(o.items.map(i=>i.quantity+' × '+i.name).join(', '))+' · '+o.weight+' kg</p></div>'+badge(o.status)+'</div><div class="journey">'+['Order received','Partner selected','Payment secured','Delivered & paid'].map((label,i)=>'<div class="'+([true,!!o.winner,!!o.contract&&o.contract.state!=='created',o.contract?.state==='released'][i]?'done':'')+'">'+label+'</div>').join('')+'</div>'+
 '<div class="classic-address"><span class="eyebrow">DELIVERING TO</span><h3>'+esc(o.customerName)+'</h3><p>'+esc(o.customerAddress.line1)+', '+esc(o.destination)+' '+esc(o.customerAddress.postalCode)+'</p></div>'+
 (o.winner?'<div class="winner"><div><span class="eyebrow">YOUR SELECTED DELIVERY PARTNER</span><h3>'+esc(o.winner.name)+'</h3><p>Delivery within '+o.winner.days+' days</p></div><div class="winner-price"><strong>'+money(o.winner.pricePaise)+'</strong><small>shipping only</small></div></div>':'<div class="notice"><b>'+(o.status==='awaiting_seller'?'Starting your delivery negotiation…':o.status==='awaiting_selection'?'Selecting the best eligible partner…':'Your delivery negotiation is in progress.')+'</b><p>'+(o.status==='awaiting_seller'?'Your agents are using the saved shipping defaults and delivery address automatically.':'The best eligible partner will be selected automatically, followed by escrow funding and the delivery simulation.')+'</p></div>')+
 (o.winner?'<details><summary>View negotiation conversation</summary>'+negotiationChat(o,false)+'</details>':negotiationChat(o,['received','parsed','broadcasting','bidding'].includes(o.status)))+(o.status==='awaiting_selection'&&!o.autoDemo?offers(o):'')+(o.status==='needs_attention'?constraintsForm(o):'')+deliveryFlow(o)+'</article>':'<div class="panel empty"><div class="orbit">✳</div><span class="eyebrow">READY WHEN YOU ARE</span><h2>Waiting for a new order</h2><p>Confirmed Everyday Store orders appear here automatically.</p><a href="'+esc(storefrontUrl)+'/shop" class="btn yellow">Go to the store →</a></div>')+(finished?'<section class="panel completion-feedback"><span class="eyebrow">DELIVERY COMPLETE</span><h2>Your parcel has arrived.</h2><p>Escrow has been released to '+esc(finished.winner.name)+'. How was the delivery?</p><a class="btn yellow" href="#track='+encodeURIComponent(finished.customerToken)+'">Leave delivery feedback →</a><a class="btn secondary" href="#analytics">View history</a></section>':'')+'</div></div></section>';
 const newSettlement=$('.settlement-scene');
 if(retainedSettlement&&newSettlement&&retainedSettlement.className===newSettlement.className)newSettlement.replaceWith(retainedSettlement);
 if(o?.route&&$('#delivery-map')){
  if(retainedMap){$('#delivery-map').replaceWith(retainedMap);map.invalidateSize(false);if(mapStage!==o.stage){marker.setLatLng(demoPoints(o)[o.stage]);mapStage=o.stage;}}
  else renderMap(o);
 }
 const chat=$('#agent-chat');if(chat)chat.scrollTop=chatFollowing?chat.scrollHeight:chatPosition;
 followStage(o);
 if(!o&&finished)window.ParcelGuide?.update(finished);
}


function contractAnimation(o,funded,released){
 const bank='<svg viewBox="0 0 100 90" aria-hidden="true"><path d="M8 28 L50 6 L92 28 Z M12 78 H88 M8 86 H92 M24 35 V72 M42 35 V72 M60 35 V72 M78 35 V72"/></svg>';
 return '<div data-order="'+esc(o.id)+'" class="settlement-scene '+(funded?'is-funded':o.contract?'is-funding':'is-drafting')+'"><article class="contract-scene"><span class="eyebrow">01 / DELIVERY AGREEMENT</span><div class="contract-paper"><span class="paper-fold"></span><b>DELIVERY CONTRACT</b><small>'+esc(o.id)+'</small><div class="ink-line"></div><div class="ink-line"></div><div class="ink-line"></div><p>'+esc(o.winner.name)+'<br>'+money(o.winner.pricePaise)+' · '+o.winner.days+'-day promise</p><div class="contract-signature">Parcelwise</div><span class="contract-seal">'+(o.contract?'✓ CREATED':'DRAFTING')+'</span></div><p class="scene-caption">'+(o.contract?'Agreement created · delivery terms recorded':'Creating your delivery agreement…')+'</p></article><article class="bank-scene"><span class="eyebrow">02 / SECURE ESCROW</span><div class="money-journey"><div class="wallet-building"><svg viewBox="0 0 80 70" aria-hidden="true"><rect x="8" y="15" width="64" height="46" rx="8"/><path d="M8 24 V12 Q8 5 16 5 H61 V15 M72 32 H51 V48 H72"/><circle cx="58" cy="40" r="2"/></svg><b>Company wallet</b><small>'+money(data.wallets.company)+' available</small></div><div class="transfer-lane" aria-hidden="true"><i>₹</i><i>₹</i><i>₹</i><span>→</span></div><div class="bank-building">'+bank+'<b>Escrow bank</b><strong>'+money(o.winner.pricePaise)+'</strong><small>'+(released?'Released to partner':funded?'✓ Secured in escrow':'Awaiting funding')+'</small></div></div><p class="scene-caption">'+(released?'Paid to '+esc(o.winner.name):funded?'Wallet debited · held until delivery confirmation':o.contract?'Transferring delivery funds into escrow…':'Transfer starts after the contract is created')+'</p><small class="simulation-label">Simulated funds · no real bank transaction</small></article></div>';
}

function deliveryFlow(o){
 if(!o.winner)return '';
 const funded=o.contract&&['funded','released'].includes(o.contract.state),released=o.contract?.state==='released';
 const email=o.email?.status;
 const emailText={sent:'Confirmation email sent',queued:'Confirmation email queued',sending:'Sending confirmation email…',needs_configuration:'Confirmation email waiting for Gmail sender setup',failed:'Email could not be sent — check sender settings',unknown:'Email delivery needs verification'}[email]||'Preparing confirmation email';
 const stages=['Partner selected','Creating contract','Funding escrow','Picked up','In transit','Out for delivery','Delivered','Payout released'];
 const current=released?7:o.stage===4?6:o.stage===3?5:o.stage===2?4:o.stage===1?3:funded?2:o.contract?1:0;
 return '<section class="delivery-flow"><div class="eyebrow">AUTOMATIC DELIVERY DEMO</div><h2>'+['Partner confirmed','Preparing escrow','Escrow funded · Preparing pickup','Parcel picked up','Your parcel is in transit','Out for delivery','Delivered · Simulating receipt','Delivery complete'][current]+'</h2><p>No action needed. This demonstration simulates carrier updates and recipient confirmation.</p><ol class="auto-stages">'+stages.map((label,i)=>'<li class="'+(i<=current?'done':'')+'" '+(i===current?'aria-current="step"':'')+'>'+label+'</li>').join('')+'</ol>'+contractAnimation(o,funded,released)+'<p class="email-status" role="status">'+esc(emailText)+'<br><small>'+esc(o.email?.recipient||'abhinavshetty0504@gmail.com')+'</small></p>'+(funded?'<div class="flow-connector" aria-hidden="true">↓</div><section class="delivery-simulation"><span class="eyebrow">SIMULATED DELIVERY</span><h2>'+['Preparing pickup','Parcel picked up','On the road','Arriving at your door','Delivered'][o.stage]+'</h2><div class="road"><span class="delivery-truck" style="left:'+Math.min(90,o.stage*22.5)+'%">▣ ➜</span></div><div id="delivery-map" aria-label="Live demo delivery route"></div><p id="map-caption" class="subtle">Simulated route and delivery stages · No live carrier GPS.</p>'+(o.stage===4?'<a class="btn yellow" href="#track='+encodeURIComponent(o.customerToken)+'">Leave delivery feedback →</a>':'')+'</section>':'')+'<details><summary>Delivery activity</summary>'+o.events.filter(e=>['selected','contract','funded','tracking','released'].includes(e.kind)).map(e=>'<p><b>'+esc(e.actor)+'</b> · '+esc(e.text)+'</p>').join('')+'</details></section>';
}

function renderAnalytics(){
 if(window.ParcelwiseBI)return window.ParcelwiseBI.render(data);
 const orders=data.orders,m=metrics(orders),waiting=orders.filter(o=>pending.includes(o.status)).length;
 $('#workspace').innerHTML=head('Everyday Store · Analytics','Delivery performance.','Order activity, carrier assignments and customer feedback.','<div class="actions"><a class="btn secondary" href="#connections">Shipping defaults</a><a class="btn yellow" href="'+esc(storefrontUrl)+'/shop">Place a demo order ↗</a></div>')+
 '<div class="kpis">'+kpi('Orders',orders.length,'All received orders')+kpi('Needs your decision',waiting,'Review constraints or choose a partner')+kpi('Active deliveries',orders.filter(o=>active.includes(o.status)).length,'Selected and booked')+kpi('Customer rating',m.avg==='—'?'—':m.avg+'/5',m.rated.length+' submitted reviews')+'</div>'+
 '<div class="grid-2"><section class="panel"><h2>Order pipeline</h2>'+bar('Needs decision',waiting,Math.max(orders.length,1),'','gold')+bar('Negotiating',orders.filter(o=>['received','parsed','broadcasting','bidding'].includes(o.status)).length,Math.max(orders.length,1))+bar('On delivery',orders.filter(o=>active.includes(o.status)).length,Math.max(orders.length,1))+bar('Completed',m.done,Math.max(orders.length,1),'','navy')+'</section>'+
 '<section class="panel"><h2>Partner assignments</h2><p class="subtle">Actual selections across your orders</p>'+data.config.partners.map(p=>bar(p.name,orders.filter(o=>o.winner?.id===p.id).length,Math.max(orders.length,1))).join('')+'</section></div>'+
 '<details class="panel"><summary>Completed order history</summary>'+orderTable(orders.filter(o=>['completed','refunded'].includes(o.status)))+'</details>'+
 '<p class="subtle">Analytics reflect your actual demo orders and submitted customer feedback.</p>';
}

function renderTable(){const orders=data.orders.filter(o=>(o.id+' '+o.customerName+' '+o.destination).toLowerCase().includes(search.toLowerCase())).filter(o=>filter==='all'||filter==='decision'&&pending.includes(o.status)||filter==='delivery'&&active.includes(o.status)||filter==='completed'&&o.status==='completed');$('#order-table').innerHTML=orderTable(orders);}
function constraintsForm(o){
 const p=o.policy,needs=o.requirements||{},deadline=Math.min(p.maxDays,needs.maxDays||14);
 return '<form id="negotiate-form" class="panel"><h2>Delivery constraints</h2><p>Set the limits your agent must respect. Customer requirements cannot be relaxed.</p><div class="form-grid">'+
 '<label>Maximum shipping cost (₹)<input name="maxShipping" type="number" min="1" max="1000" step=".01" required value="'+p.maxShipping/100+'"></label>'+
 '<label>Deliver within (days)<input name="maxDays" type="number" min="1" max="'+(needs.maxDays||14)+'" required value="'+deadline+'"></label>'+
 '<label>Minimum reliability (%)<input name="minReliability" type="number" min="0" max="100" required value="'+(p.minReliability??90)+'"></label>'+
 '<label>Ranking priority<select name="priority">'+['balanced','price','speed','reliability'].map(x=>'<option '+(p.priority===x?'selected':'')+' value="'+x+'">'+({balanced:'Best balance',price:'Lowest cost',speed:'Fastest delivery',reliability:'Reliability & care'}[x])+'</option>').join('')+'</select></label>'+
 '<label>Handling<select name="fragile" '+(needs.fragile?'disabled':'')+'><option value="false">Standard parcel</option><option value="true" '+(needs.fragile||p.fragile?'selected':'')+'>Fragile-item handling</option></select></label>'+
 '<div><small>Automatically checked</small><p>'+esc(o.origin)+' → '+esc(o.destination)+'<br>'+o.weight+' kg · '+o.length+' × '+o.width+' × '+o.height+' cm</p></div></div>'+
 '<div class="form-footer"><small>'+((o.ai?.mode==='openai')?'OpenAI agent proposals':'Local policy-agent simulation · OpenAI key not enabled')+' · You approve the partner. Carrier booking is simulated.</small><button class="btn yellow" type="submit">Find suitable partners →</button></div><p class="error" id="form-error" role="alert"></p></form>';
}
function offers(o){return '<section class="panel"><div class="panel-title"><div><h2>Your delivery shortlist</h2><p>All shown offers meet the agreed constraints. The final choice is yours.</p></div><span class="badge pending">Seller approval required</span></div><div class="offers">'+o.offers.map(p=>'<article class="offer '+(p.id===o.recommended?'recommended':'')+'">'+(p.id===o.recommended?'<span class="badge pending">Recommended</span>':'<span class="badge">Eligible alternative</span>')+'<h3 style="margin-top:16px">'+esc(p.name)+'</h3><div class="score">'+p.score+'<small> /100 fit</small></div>'+bar('Profile reliability',Math.round(p.reliability*100),100,'%')+'<div class="price">'+money(p.pricePaise)+'</div><small>'+p.days+'-day delivery · '+money(p.openingPrice-p.pricePaise)+' negotiated saving</small><ul><li>Within '+money(o.policy.maxShipping)+' budget</li><li>Meets '+o.policy.maxDays+'-day deadline</li><li>'+p.allReviews+' real demo reviews · '+p.routeReviews+' on this route</li><li>Parcel care estimate: '+(1+p.quality*4).toFixed(1)+'/5</li></ul><button class="btn '+(p.id===o.recommended?'yellow':'secondary')+'" data-select="'+p.id+'">Select '+esc(p.name)+' →</button></article>').join('')+'</div><details><summary>How recommendations are ranked</summary><p>Budget, deadline, coverage, weight, handling and reliability are hard limits. Eligible offers are ranked by price, speed, reliability and parcel care using your chosen priority. Profile estimates begin with demo historical priors (40 deliveries); new feedback updates them, with greater weight for the same route. Fit score is a comparison, not a delivery guarantee.</p></details></section>';}
function negotiationChat(o,running){
 const events=o.events||[];let start=0;
 events.forEach((e,i)=>{if(e.kind==='negotiation_requested')start=i;});
 const messages=events.slice(start).filter(e=>['counter','offer','declined','broadcast','recommended','attention'].includes(e.kind));
 if(!running&&!messages.length)return '';
 return '<section class="panel negotiation-chat"><div class="panel-title"><div><div class="eyebrow">Agent conversation</div><h2>Negotiation room</h2><p>'+(o.negotiationMode==='openai'?'OpenAI agents':'Local policy-agent simulation')+' · Actual proposals · '+(o.autoDemo?'Automatic partner selection':'Seller approval required')+'</p></div><span class="badge '+(running?'pending':'')+'">'+(running?'Live · Updating':o.status==='awaiting_selection'?(o.autoDemo?'Selecting best offer':'Ready for your decision'):'Conversation saved')+'</span></div><div id="agent-chat" class="chat-feed" role="log" aria-label="Seller and delivery partner negotiation" aria-live="polite" tabindex="0">'+
 messages.map(e=>{const seller=/Company|Seller/.test(e.actor),system=['broadcast','recommended','attention'].includes(e.kind);return '<article class="chat-message '+(system?'chat-system':seller?'chat-seller':'chat-partner')+'"><div class="chat-meta"><strong>'+esc(e.actor.replace('Company agent','Seller agent'))+'</strong><span>'+esc(e.kind==='offer'?'Offer':e.kind==='counter'?'Counteroffer':e.kind==='declined'?'Declined':'Update')+'</span></div><p>'+esc(e.text)+'</p><time datetime="'+esc(e.at)+'">'+esc(new Date(e.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'}))+'</time></article>';}).join('')+
 (!messages.length?'<p class="chat-empty">Checking your delivery constraints and contacting eligible partner agents…</p>':'')+'</div><div class="chat-footer">'+(running?'<span class="chat-pulse" aria-hidden="true"></span>Waiting for the next agent response…':(o.autoDemo?'The demo continues automatically through selection, escrow and delivery.':'Negotiation paused or complete. No booking happens without your selection.'))+'</div></section>';
}
function renderOrder(o){
 window.ParcelGuide?.update(o);
 order=o;const partnerView=location.hash.includes('&partner='),negotiating=['received','parsed','broadcasting','bidding'].includes(o.status);
 const steps=['Order received','Compare offers','Seller selection','Delivery','Feedback'],step=o.feedback?4:o.winner?3:o.status==='awaiting_selection'?2:o.status==='awaiting_seller'?0:1;
 let html='<a class="back" href="'+(partnerView?'#partner='+partnerId:'#platform')+'">← Back to '+(partnerView?'partner':'seller')+' dashboard</a>'+head(esc(o.id),esc(o.origin)+' → '+esc(o.destination),esc(o.items.map(i=>i.quantity+' × '+i.name).join(', ')),badge(o.status))+
 '<div class="steps">'+steps.map((x,i)=>'<div class="step '+(i<=step?'active':'')+'">'+(i+1)+'. '+x+'</div>').join('')+
 '</div><section class="panel"><div class="detail-list"><div><small>Customer</small><b>'+esc(o.customerName)+'</b></div><div><small>Seller</small><b>'+esc(o.sellerName||'Everyday Store')+'</b></div><div><small>Customer requirement</small><b>Within '+(o.requirements?.maxDays||o.policy.maxDays)+' days · '+(o.requirements?.fragile?'Fragile':'Standard')+'</b></div></div><div class="delivery-address"><h3>Delivery address from checkout</h3><p>'+esc(o.sellerAddress.line1)+', '+esc(o.origin)+' → '+esc(o.customerAddress.line1)+', '+esc(o.destination)+' '+esc(o.customerAddress.postalCode)+'</p><p>'+o.weight+' kg · '+o.length+' × '+o.width+' × '+o.height+' cm</p></div></section>';
 if(!partnerView&&o.status==='needs_attention')html+=(o.status==='needs_attention'?'<div class="note">'+esc(o.negotiationError||'No partner meets all constraints. Review the reasons below and adjust the seller limits. Customer requirements still apply.')+'</div>':'')+constraintsForm(o);
 html+=negotiationChat(o,negotiating);
 if(o.status==='awaiting_selection'&&!partnerView&&!o.autoDemo)html+=offers(o)+'<details class="panel"><summary>Change constraints and negotiate again</summary>'+constraintsForm(o)+'</details>';
 if(o.winner){
 html+='<section class="panel"><div class="panel-title"><div><h2>'+esc(o.winner.name)+(o.autoDemo?' · Selected automatically':' · Selected by seller')+'</h2><p>'+money(o.winner.pricePaise)+' · '+o.winner.days+'-day promise · '+o.winner.score+'/100 fit</p></div>'+badge(o.status)+'</div><small>Budget '+money(o.policy.maxShipping)+' · Deadline '+o.policy.maxDays+' days · Minimum reliability '+(o.policy.minReliability||0)+'% · '+(o.policy.fragile?'Fragile handling':'Standard handling')+'</small>';
 if(o.contract?.state==='funded'||o.stage>0)html+='<div id="delivery-map" aria-label="Delivery route map"></div><p class="subtle" id="map-caption">Demo route between cities · Stage updates, not live GPS.</p><div class="steps">'+['Booked','Picked up','In transit','Out for delivery','Delivered'].map((x,i)=>'<div class="step '+(i<=o.stage?'active':'')+'">'+x+'</div>').join('')+'</div>';
 if(partnerView&&!o.autoDemo&&o.contract?.state==='funded'&&o.stage<4)html+='<button class="btn yellow" data-advance="'+(o.stage+1)+'">Report: '+['','Picked up','In transit','Out for delivery','Delivered'][o.stage+1]+' →</button>';
 if(!partnerView&&!o.autoDemo&&o.contract?.state==='funded'&&o.stage<4)html+='<p class="note">Awaiting delivery updates from '+esc(o.winner.name)+'. <a href="#partner='+o.winner.id+'">Open the partner demo workspace →</a></p>';
 if(o.status==='needs_funding'&&!partnerView)html+='<p class="note">The seller wallet needs funds before pickup.</p><button class="btn" data-fund>Retry funding</button>';
 if(o.status==='disputed'&&!partnerView)html+='<p class="note">The customer reported a delivery issue. Held shipping funds can be refunded for this demo.</p><button class="btn secondary" data-refund>Resolve with shipping refund</button>';
 if(o.feedback)html+='<div class="review"><strong>'+o.feedback.rating+'/5 customer rating</strong><p>'+esc(o.feedback.comment||'No written comment.')+'</p><small>'+(o.feedback.ontime?'On time':'Late')+' · '+(o.feedback.success?'Correct parcel':'Parcel issue')+'</small></div>';
 html+='</section>';
 }
 if(!partnerView)html+='<section class="panel"><div class="split"><div><h2>Customer delivery page</h2><p>Receipt confirmation and ratings are available to the customer after delivery.</p></div><a class="btn secondary" href="#track='+encodeURIComponent(o.customerToken)+'">View customer page →</a></div></section>';
 if(o.excluded?.length)html+='<details class="panel"><summary>'+o.excluded.length+' excluded partner(s) · View reasons</summary>'+o.excluded.map(p=>'<p><b>'+esc(p.name)+':</b> '+esc(p.reason)+'</p>').join('')+'</details>';
 html+='<details class="panel" id="transcript"><summary>Negotiation & activity log ('+o.events.length+')</summary><div class="events">'+o.events.map(e=>'<div class="event"><b>'+esc(e.actor)+'</b><p>'+esc(e.text)+'</p><small>'+new Date(e.at).toLocaleTimeString()+'</small></div>').join('')+'</div></details>';
 const opened=$('#transcript')?.open,oldChat=$('#agent-chat'),chatTop=oldChat?.scrollTop||0,followChat=!oldChat||oldChat.scrollHeight-oldChat.scrollTop-oldChat.clientHeight<70;
 disposeMap();$('#workspace').innerHTML=html;if(opened)$('#transcript').open=true;if($('#delivery-map'))renderMap(o);
 const chat=$('#agent-chat');if(chat)chat.scrollTop=followChat?chat.scrollHeight:chatTop;
}
function disposeMap(){if(map){map.remove();map=null;marker=null;}mapOrderId=null;mapStage=null;}
function demoPoints(o){let a=o.route.pickup,b=o.route.destination;if(a[0]===b[0]&&a[1]===b[1])b=[b[0]+.06,b[1]+.08];return [a,[(a[0]*3+b[0])/4,(a[1]*3+b[1])/4],[(a[0]+b[0])/2+.15,(a[1]+b[1])/2],[(a[0]+b[0]*3)/4,(a[1]+b[1]*3)/4],b];}
function renderMap(o){
 if(!window.L){$('#delivery-map').textContent='Map unavailable. Delivery milestones are shown below.';return;}
 let a=o.route.pickup,b=o.route.destination;if(a[0]===b[0]&&a[1]===b[1])b=[b[0]+.06,b[1]+.08];
 const points=[a,[(a[0]*3+b[0])/4,(a[1]*3+b[1])/4],[(a[0]+b[0])/2+.15,(a[1]+b[1])/2],[(a[0]+b[0]*3)/4,(a[1]+b[1]*3)/4],b];
 map=L.map('delivery-map',{scrollWheelZoom:false}).fitBounds(L.latLngBounds(points),{padding:[35,35],maxZoom:12});
 L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).on('tileerror',()=>{$('#map-caption').textContent='Map tiles unavailable; the demo route and milestones remain available.';}).addTo(map);
 L.polyline(points,{color:'#287d79',weight:4,dashArray:'7 9'}).addTo(map);
 L.circleMarker(a,{radius:6,color:'#09222d'}).addTo(map).bindTooltip('Pickup · '+o.origin);L.circleMarker(b,{radius:6,color:'#b39700'}).addTo(map).bindTooltip('Destination · '+o.destination);
 mapOrderId=o.id;mapStage=o.stage;
 marker=L.marker(points[o.stage],{title:'Reported delivery stage',icon:L.divIcon({className:'parcel-pin',iconSize:[22,22],iconAnchor:[11,11]})}).addTo(map);
}
function renderPartner(){
 const p=data.config.partners.find(p=>p.id===partnerId);if(!p)throw Error('Unknown partner');
 const orders=data.orders.filter(o=>o.winner?.id===partnerId),m=metrics(orders);
 $('#workspace').innerHTML=head('Delivery partner workspace',esc(p.name)+' · Your deliveries.','Your assigned work, service promises, and customer feedback.','<span class="badge">'+esc(p.name)+' account</span>')+
 '<div class="kpis">'+kpi('Assigned orders',orders.length,'Seller-approved deliveries')+kpi('Active work',orders.filter(o=>active.includes(o.status)).length,'Pickup to receipt')+kpi('Customer rating',m.avg==='—'?'—':m.avg+'/5',m.rated.length+' reviews')+kpi('On-time feedback',m.ontime===null?'—':m.ontime+'%',m.rated.length?'Based on submitted feedback':'No feedback yet')+'</div>'+
 '<div class="grid-2"><section class="panel"><h2>Rating distribution</h2>'+[5,4,3,2,1].map(n=>bar(n+' stars',m.rated.filter(o=>o.feedback.rating===n).length,Math.max(1,m.rated.length),'','gold')).join('')+'</section><section class="panel"><h2>Your service profile</h2><div class="detail-list"><div><small>Price floor</small><b>'+money(p.minPrice)+'</b></div><div><small>Transit promise</small><b>'+p.deliveryDays+' days</b></div><div><small>Weight limit</small><b>'+p.maxWeight+' kg</b></div></div><p>Fragile handling: '+(p.fragile?'Available':'Unavailable')+'<br>Coverage exclusions: '+esc(p.excludedCities.join(', ')||'None')+'<br>Maximum negotiation discount: '+p.maxDiscount+'%</p><details><summary>Edit my demo service policy</summary>'+partnerForm(p)+'</details></section></div>'+
 '<section class="panel"><h2>Active assignments</h2>'+orderTable(orders.filter(o=>!['completed','refunded'].includes(o.status)),true)+'</section>'+
 '<details class="panel"><summary>Delivery history ('+orders.filter(o=>['completed','refunded'].includes(o.status)).length+')</summary>'+orderTable(orders.filter(o=>['completed','refunded'].includes(o.status)),true)+'</details>'+
 '<section class="panel"><h2>Customer feedback</h2>'+(m.rated.length?m.rated.map(o=>'<article class="review"><div class="split"><strong>'+o.feedback.rating+'/5</strong><small>'+esc(o.id)+' · '+esc(o.sellerName||'Everyday Store')+'</small></div><p>'+esc(o.feedback.comment||'Rating submitted without a comment.')+'</p><small>'+esc(o.origin)+' → '+esc(o.destination)+' · '+(o.feedback.ontime?'On time':'Late')+'</small></article>').join(''):'<p>No feedback yet. Ratings appear after customers review delivered orders.</p>')+'</section>';
}
function partnerForm(p){return '<form id="partner-policy"><div class="form-grid"><label>Minimum price (₹)<input name="minPrice" type="number" min="1" max="1000" step=".01" value="'+p.minPrice/100+'" required></label><label>Max. discount (%)<input name="maxDiscount" type="number" min="0" max="40" value="'+p.maxDiscount+'" required></label><label>Transit (days)<input name="deliveryDays" type="number" min="1" max="14" value="'+p.deliveryDays+'" required></label><label>Weight limit (kg)<input name="maxWeight" type="number" min="1" max="100" value="'+p.maxWeight+'" required></label><label>Fragile handling<select name="fragile"><option value="true" '+(p.fragile?'selected':'')+'>Available</option><option value="false" '+(!p.fragile?'selected':'')+'>Unavailable</option></select></label><label>Availability<select name="enabled"><option value="true" '+(p.enabled?'selected':'')+'>Available</option><option value="false" '+(!p.enabled?'selected':'')+'>Paused</option></select></label></div><p>Coverage exclusions are preserved: '+esc(p.excludedCities.join(', ')||'None')+'.</p><button class="btn" type="submit">Save profile</button><p class="error" id="form-error"></p></form>';}
function renderSettings(){const p=data.config.company;$('#workspace').innerHTML='<a class="back" href="#platform">← Seller dashboard</a>'+head('Seller policy','Your shipping defaults.','Defaults apply when you begin a new negotiation. Existing bookings keep their agreed terms.')+'<form id="seller-policy" class="panel"><div class="form-grid"><label>Company name<input name="name" required maxlength="60" value="'+esc(p.name)+'"></label><label>Shipping budget (₹)<input name="maxShipping" type="number" min="1" max="1000" step=".01" required value="'+p.maxShipping/100+'"></label><label>Deadline (days)<input name="maxDays" type="number" min="1" max="14" required value="'+p.maxDays+'"></label><label>Minimum reliability (%)<input name="minReliability" type="number" min="0" max="100" required value="'+(p.minReliability??90)+'"></label><label>Priority<select name="priority">'+['balanced','price','speed','reliability'].map(x=>'<option '+(p.priority===x?'selected':'')+'>'+x+'</option>').join('')+'</select></label></div><div class="form-footer"><p>Coverage, billable weight and handling are also checked for each order.</p><button class="btn yellow">Save defaults</button></div><p class="error" id="form-error"></p></form>';}
function renderCustomer(o){
 window.ParcelGuide?.update(o);
 const delivered=o.stage===4,review=o.feedback;$('#workspace').innerHTML='<div class="confirmation">'+head('Customer delivery',o.status==='awaiting_seller'?'Your order is confirmed.':o.status==='completed'?'Delivered. Thank you.':'Your delivery, at a glance.','Order '+esc(o.id),badge(o.status))+
 '<section class="panel"><h2>'+esc(o.items.map(i=>i.quantity+' × '+i.name).join(', '))+'</h2><p>'+esc(o.origin)+' → '+esc(o.destination)+'</p><p>'+(o.winner?esc(o.winner.name)+' · '+o.winner.days+'-day delivery promise':'Your seller is arranging a suitable delivery partner.')+'</p><div class="steps">'+['Ordered','Picked up','In transit','Out for delivery','Arrived'].map((x,i)=>'<div class="step '+(i<=o.stage?'active':'')+'">'+x+'</div>').join('')+'</div>'+
 (o.status==='awaiting_confirmation'?'<div class="note">The partner reports delivery. Please confirm that your parcel arrived.</div><div class="actions"><button class="btn yellow" data-customer="confirm">I received my parcel</button><button class="btn secondary" data-customer="dispute">Report a delivery issue</button></div>':'')+
 (o.status==='disputed'?'<p class="note">Your delivery issue has been recorded. Payment is held for seller review.</p>':'')+'</section>'+
 (delivered&&!review?'<form class="panel" id="feedback"><h2>How was your delivery?</h2><p>Your review helps sellers choose the right partner next time.</p><div class="form-grid"><label>Rating<select name="rating">'+[5,4,3,2,1].map(n=>'<option value="'+n+'">'+n+' / 5</option>').join('')+'</select></label><label>Arrived on time?<select name="ontime"><option value="true">Yes</option><option value="false">No</option></select></label><label>Correct parcel?<select name="success"><option value="true">Yes</option><option value="false">No</option></select></label><label class="full">Your feedback (optional)<textarea name="comment" maxlength="500" placeholder="What went well? What could improve?"></textarea></label></div><div class="form-footer"><small>One review per delivery.</small><button class="btn yellow">Submit feedback</button></div><p class="error" id="form-error"></p></form>':'')+
 (review?'<section class="panel"><h2>Thanks for your feedback.</h2><strong>'+review.rating+'/5</strong><p>'+esc(review.comment||'Your rating has been recorded.')+'</p></section>':'')+
 '<a class="btn secondary" href="#platform">Back to dashboard</a></div>';
 order=o;
}
function updateWallet(wallets){
 if(!wallets||!$('#wallet-available'))return;
 $('#wallet-available').textContent=money(wallets.company);
 $('#wallet-escrow').textContent=money(wallets.escrow);
 $('#wallet-paid').textContent=money((wallets['partner:A']||0)+(wallets['partner:B']||0)+(wallets['partner:C']||0));
}
async function refresh(force=false){
 if(busy)return;busy=true;const version=routeVersion,hash=location.hash.slice(1);
 try{
 let result;if(hash.startsWith('order='))result=await api('v1/orders/'+encodeURIComponent(hash.slice(6).split('&')[0]));else if(hash.startsWith('track='))result=await api('tracking/'+encodeURIComponent(token));else result=await api('platform');
 if(version!==routeVersion)return;
 if(typeof portalAccount!=='undefined'&&portalAccount==='company'){
  const wallets=result.wallets||(hash.startsWith('order=')?(await api('platform')).wallets:null);
  if(version!==routeVersion)return;
  updateWallet(wallets);
 }
 if(hash==='analytics'&&window.ParcelwiseBI)await window.ParcelwiseBI.load();
 if(version!==routeVersion)return;
 const signature=JSON.stringify(result);if(!force&&signature===lastSignature)return;
 if(!force&&(formDirty||document.activeElement?.matches('input,select,textarea')))return;
 lastSignature=signature;
 if(hash.startsWith('order='))renderOrder(result);else if(hash.startsWith('track='))renderCustomer(result);else{data=result;if(hash.startsWith('partner='))renderPartner();else if(hash==='connections')renderSettings();else if(hash==='analytics')renderAnalytics();else renderSeller();}
 }catch(e){toast(e.message);if(!$('#workspace').innerHTML)$('#workspace').innerHTML='<div class="panel"><h2>Unable to load this page</h2><p>'+esc(e.message)+'</p><a href="#platform">Back to dashboard</a></div>';}finally{busy=false;}
}
async function route(){const version=++routeVersion;formDirty=false;clearInterval(timer);disposeMap();lastSignature='';$('#workspace').innerHTML='';const hash=location.hash.slice(1);token=hash.startsWith('track=')?decodeURIComponent(hash.slice(6)):null;partnerId=hash.startsWith('partner=')?hash.slice(8):hash.includes('&partner=')?hash.split('&partner=')[1]:'A';while(busy)await new Promise(r=>setTimeout(r,50));if(version!==routeVersion)return;try{if(typeof portalGate==='function'&&!await portalGate(hash))return;}catch(error){toast(error.message);return;}if(version!==routeVersion)return;await refresh(true);if(version===routeVersion)timer=setInterval(()=>refresh(),2000);}
document.addEventListener('input',e=>{if(e.target.closest('form'))formDirty=true;});
document.addEventListener('change',e=>{if(e.target.closest('form'))formDirty=true;});
document.addEventListener('input',e=>{if(e.target.id==='order-search'){search=e.target.value;renderTable();}});
document.addEventListener('change',e=>{if(e.target.id==='status-filter'){filter=e.target.value;renderTable();}if(e.target.id==='partner-select')location.hash='partner='+e.target.value;});
document.addEventListener('click',async e=>{
 const b=e.target.closest('button');if(!b||(b.type==='submit'&&b.closest('form')))return;
 if(b.hasAttribute('data-follow-demo')){followDemo=!followDemo;b.textContent='Auto-follow: '+(followDemo?'On':'Off');b.setAttribute('aria-pressed',String(followDemo));return;}
 if(b.dataset.currentOrder){currentOrder=b.dataset.currentOrder;renderSeller();return;}
 if(!b.hasAttribute('data-select')&&!b.hasAttribute('data-advance')&&!b.hasAttribute('data-fund')&&!b.hasAttribute('data-refund')&&!b.dataset.customer)return;
 b.disabled=true;
 try{
 if(b.dataset.select)await api('demo/order-action',{id:order.id,action:'select',partnerId:b.dataset.select});
 if(b.dataset.advance)await api('demo/partner-action',{orderId:order.id,partnerId,stage:Number(b.dataset.advance)});
 if(b.hasAttribute('data-fund'))await api('demo/order-action',{id:order.id,action:'fund'});
 if(b.hasAttribute('data-refund'))await api('demo/order-action',{id:order.id,action:'refund'});
 if(b.dataset.customer)await api('tracking-action',{id:order.id,token,action:b.dataset.customer});
 await refresh(true);toast(b.dataset.select?'Partner selected. Booking is being prepared.':'Delivery updated.');
 }catch(error){toast(error.message);}finally{b.disabled=false;}
});
document.addEventListener('submit',async e=>{
 const f=e.target;if(!['negotiate-form','feedback','seller-policy','partner-policy'].includes(f.id))return;
 e.preventDefault();const b=e.submitter;b.disabled=true;const d=Object.fromEntries(new FormData(f));
 try{
 if(f.id==='negotiate-form')await api('demo/order-action',{id:order.id,action:'negotiate',maxShipping:Math.round(Number(d.maxShipping)*100),maxDays:Number(d.maxDays),minReliability:Number(d.minReliability),priority:d.priority,fragile:order.requirements?.fragile||d.fragile==='true'});
 if(f.id==='feedback')await api('tracking-action',{id:order.id,token,action:'feedback',rating:Number(d.rating),ontime:d.ontime==='true',success:d.success==='true',comment:d.comment});
 if(f.id==='seller-policy')await api('connections',{id:'company',config:{...data.config.company,name:d.name,maxShipping:Math.round(Number(d.maxShipping)*100),maxDays:Number(d.maxDays),minReliability:Number(d.minReliability),priority:d.priority}});
 if(f.id==='partner-policy')await api('connections',{id:'partner:'+partnerId,config:{...data.config.partners.find(p=>p.id===partnerId),minPrice:Math.round(Number(d.minPrice)*100),maxDiscount:Number(d.maxDiscount),deliveryDays:Number(d.deliveryDays),maxWeight:Number(d.maxWeight),fragile:d.fragile==='true',enabled:d.enabled==='true'}});
 formDirty=false;await refresh(true);toast(f.id==='feedback'?'Feedback saved. Future recommendations will use your review.':'Saved.');
 }catch(error){if($('#form-error'))$('#form-error').textContent=error.message;else toast(error.message);}finally{b.disabled=false;}
});
window.addEventListener('hashchange',route);
route();
