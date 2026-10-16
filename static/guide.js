/* Local, contextual guidance. No chat service or personal data transmission. */
(()=>{
 const fox=`<svg viewBox="0 0 150 160" aria-hidden="true"><ellipse cx="77" cy="149" rx="46" ry="7" fill="#123b3b" opacity=".13"/><path d="M105 133 Q153 130 136 82 Q126 108 109 105" fill="#d88a48"/><path d="M136 82 Q132 103 121 106 L134 116 Q144 103 136 82" fill="#fff0cf"/><ellipse cx="75" cy="117" rx="31" ry="30" fill="#d88a48"/><ellipse cx="75" cy="123" rx="19" ry="22" fill="#fff0cf"/><path d="M32 61 L28 13 L63 37 M91 37 L124 13 L121 66" fill="#d88a48" stroke="#573d34" stroke-width="3"/><path d="M38 43 L36 27 L52 41 M100 41 L116 27 L115 47" fill="#805347"/><path d="M28 62 Q28 29 76 30 Q125 30 125 66 Q124 102 76 111 Q27 101 28 62" fill="#e8a259"/><path d="M30 65 Q54 58 76 89 Q99 58 124 65 Q119 100 76 110 Q35 100 30 65" fill="#fff0cf"/><g class="fox-eyes" fill="#173f3e"><ellipse cx="53" cy="66" rx="5" ry="7"/><ellipse cx="100" cy="66" rx="5" ry="7"/></g><circle cx="54" cy="64" r="1.5" fill="white"/><circle cx="101" cy="64" r="1.5" fill="white"/><path d="M68 87 Q76 81 84 87 L76 95 Z" fill="#173f3e"/><path d="M76 95 Q69 102 64 96 M76 95 Q83 102 89 96" fill="none" stroke="#173f3e" stroke-width="2" stroke-linecap="round"/><path d="M46 107 Q76 120 104 107 L103 119 Q76 129 46 118Z" fill="#236c68"/><path d="M93 118 L108 136 L91 139 L83 120" fill="#236c68"/><rect x="44" y="123" width="47" height="29" rx="4" fill="#f3cc55" stroke="#ad822d"/><path d="M64 124 V136 H73 V124" fill="#fff0cf"/><ellipse cx="43" cy="127" rx="8" ry="10" fill="#d88a48"/><ellipse cx="94" cy="128" rx="8" ry="10" fill="#d88a48"/></svg>`;
 const root=document.createElement('aside');root.className='parcel-guide';root.setAttribute('aria-label','Milo delivery guide');
 root.innerHTML='<section class="guide-bubble" id="milo-panel"><button class="guide-close" aria-label="Minimize Milo">×</button><small>YOUR PARCELWISE COMPANION</small><h2>Hi, I’m Milo!</h2><p id="milo-message" aria-live="polite"></p><div class="guide-topics"><button data-topic="stage">What’s happening?</button><button data-topic="filters">Using filters</button><button data-topic="charts">Reading charts</button><button data-topic="correlation">Correlations</button></div><small class="guide-hint">Tap me whenever you need a hand.</small></section><button class="guide-character" aria-label="Ask Milo the fox for help" aria-controls="milo-panel" aria-expanded="true">'+fox+'<span>Milo · your guide</span></button>';
 document.body.append(root);let dismissed=false,current=null,lastKey='',topic='stage',interaction='';
 const messages={received:'Your order has arrived! I’m helping your agents read the address and delivery requirements.',parsed:'We’ve checked the parcel and destination. Next, the agents will ask carriers for offers.',broadcasting:'Fedx, Delhivery and Shiprocket are receiving the delivery request. Their agents will compare price and service.',bidding:'The agents are negotiating. Watch their offers change as they work toward your budget and deadline.',awaiting_selection:'The offers are ready. We’ll automatically choose the highest-ranked eligible partner.',deal_finalized:'Your partner is selected! Watch the delivery agreement take shape with the agreed price and deadline.',contract_created:'The agreement is created. The coins show the next step: moving demo funds from the company wallet into escrow.',booked:'Escrow is funded. That amount has left the available wallet and is held securely while pickup is prepared.',picked_up:'Your partner has picked up the parcel. The map now follows the simulated delivery journey.',in_transit:'Your parcel is on the road! These are simulated milestones, not live GPS updates.',out_for_delivery:'Almost there! The parcel is on its final delivery leg.',awaiting_confirmation:'Delivered! The demo will simulate receipt and release escrow. You can now leave your own feedback.',completed:'Delivery complete and escrow released! Leave a review, then use Back to dashboard. The completed order is saved in Analytics.',needs_attention:'This order needs attention: no offer met the requirements. Review the constraints before trying again.',needs_funding:'The wallet needs more demo funds before escrow can be funded. Delivery has not started.',disputed:'A delivery issue was reported. Escrow is held while the issue is resolved.',refunded:'The held delivery funds were returned to the company wallet.'};
 function text(){if(interaction)return interaction;const hash=location.hash;
 if(topic==='filters')return 'Start with a date range, then combine partners, cities, service levels or weather. Every chart updates together. Click a carrier bar or heatmap city to drill down; Reset clears your filters.';
 if(topic==='charts')return 'The lines show monthly volume and spend. Carrier bars compare cost and on-time delivery. The heatmap compares cities and carriers. On-time rate counts delivered orders only; the scorecard shows the full breakdown.';
 if(topic==='correlation')return 'Choose X and Y in the correlation explorer. Pearson r near +1 means they tend to rise together; near −1 means they move oppositely; near 0 means little linear relationship. This synthetic data demonstrates patterns, not causation or real carrier performance.';
 if(hash==='#analytics')return 'Welcome to Analytics! Explore 12,000 synthetic historical orders. Try a date preset and a partner filter, then ask me about charts or correlations. Live demo history is listed separately below.';
 if(current)return current.feedback?'Thanks for the review! Your rating is saved. Use Back to dashboard to return to the workspace.':messages[current.status]||'I’m following this order. The activity log shows its latest update.';
 if(hash.startsWith('#login'))return 'Welcome! Sign in to the Everyday Store workspace or a delivery partner account with the demo credentials shown on this page.';
 if(hash.startsWith('#partner'))return 'This is your carrier workspace: assigned deliveries, service policies and customer feedback live here.';
 if(hash==='#connections')return 'Set your shipping budget, delivery deadline and carrier requirements here. They guide future negotiations.';
 if(document.querySelector('#confirmation:not([hidden])'))return 'Your order is confirmed! Parcelwise will handle negotiation and delivery automatically. Open the seller dashboard to watch the journey.';
 if(document.querySelector('#products'))return 'Pick an everyday essential and enter the delivery address at checkout. Once ordered, the seller dashboard will show the automatic delivery simulation.';
 if(document.querySelector('#workspace'))return 'I’m Milo, your delivery fox! We’re waiting for a new order. I’ll explain negotiation, the contract, escrow and delivery as they happen. Tap me for help anytime.';
 return 'I’m Milo, your delivery fox! Parcelwise helps stores negotiate delivery, secure funds in escrow and follow each parcel. Enter the workspace to see it in action.';
 }
 function draw(){root.querySelector('#milo-message').textContent=text();root.querySelector('.guide-topics').hidden=location.hash!=='#analytics';root.querySelector('h2').textContent=interaction?'Here’s what changed.':topic==='stage'?'Hi, I’m Milo!':{filters:'Make the data yours.',charts:'Let’s read the charts.',correlation:'Find relationships.'}[topic];}
 function setOpen(open){root.querySelector('.guide-bubble').hidden=!open;root.querySelector('.guide-character').setAttribute('aria-expanded',String(open));}
 root.querySelector('.guide-close').onclick=()=>{dismissed=true;setOpen(false)};
 root.querySelector('.guide-character').onclick=()=>{const open=root.querySelector('.guide-bubble').hidden;dismissed=!open;root.classList.remove('has-update');draw();setOpen(open)};
 root.querySelectorAll('[data-topic]').forEach(b=>b.onclick=()=>{interaction='';topic=b.dataset.topic;draw()});
 window.ParcelGuide={explain(message){interaction=message;dismissed=false;root.classList.remove('has-update');draw();setOpen(true)},update(o){current=o||null;const key=(o?.id||'')+':'+(o?.status||'')+':'+!!o?.feedback;if(key===lastKey)return;lastKey=key;interaction='';topic='stage';draw();if(!dismissed)setOpen(true)}};

 function respond(message,withCount=false){
  // Defer until the dashboard's event handlers have redrawn the filtered charts.
  setTimeout(()=>{interaction=message+(withCount?' '+(document.querySelector('.bi-selection')?.textContent||'').split('All visuals')[0].trim()+'.':'');draw();if(dismissed)root.classList.add('has-update');else setOpen(true);},0);
 }
 document.addEventListener('change',e=>{
  const t=e.target,d=t.dataset;if(!d||t.closest('.parcel-guide'))return;
  const selected=t.options?.[t.selectedIndex]?.textContent||t.value;
  if(d.biPartner)respond((t.checked?'Included ':'Removed ')+d.biPartner+' in your carrier selection. With none checked, all partners are included.',true);
  else if(d.biFilter){
   if(['x','y'].includes(d.biFilter))respond('The '+d.biFilter.toUpperCase()+' axis now shows '+selected+'. The scatter plot and Pearson r recalculate for the current filtered orders. Correlation does not prove causation.');
   else respond((t.closest('label')?.childNodes[0]?.textContent?.trim()||d.biFilter)+': '+selected+'. The KPIs, charts and table now use this selection.',true);
  }else if(t.closest('#feedback'))respond('You’re editing your review. It is only saved when you press Submit feedback.');
 },true);
 document.addEventListener('click',e=>{
  if(e.target.closest('[data-bi-explain]'))return;
  const b=e.target.closest('button,a,summary');if(!b||b.closest('.parcel-guide'))return;const d=b.dataset;
  if('biReset' in d)respond('Filters reset. You’re viewing the full synthetic history again.',true);
  else if(d.biPreset)respond('Date range changed to '+b.textContent.trim()+'. All visuals now use this period.',true);
  else if(d.biDrill)respond('You drilled into '+d.value+'. Compare the charts for this group, or use Reset to return to all orders.',true);
  else if('biExport'in d)respond('Exporting all matching orders to CSV—not just the visible table page. The file contains synthetic reference data.');
  else if(d.biSort)respond('The detail table is now sorted by '+b.textContent.replace(/[↑↓]/g,'').trim()+'. Click the heading again to reverse the order.');
  else if(d.biPage)respond('Showing another page of order details. Your filters still apply; CSV export includes every matching row.');
  else if(d.currentOrder)respond('Opening order '+d.currentOrder+'. I’ll follow its negotiation, escrow and delivery status.');
  else if('followDemo'in d)respond(b.getAttribute('aria-pressed')==='true'?'Auto-follow is now off. You can explore without automatic scrolling.':'Auto-follow is now on. The dashboard will scroll to each new delivery stage.');
  else if(b.matches('#company-wallet summary'))respond('The wallet shows available demo credits. Funding escrow deducts the shipping price; escrow holds it until receipt, then releases it to the selected partner.');
  else if(b.matches('summary')&&b.textContent.includes('Delivery activity'))respond('This log records the partner selection, contract, funding, tracking updates and payout in order.');
  else if(b.matches('summary')&&b.textContent.includes('negotiation'))respond('The conversation shows the agents negotiating against your budget, deadline and handling requirements.');
 },true);
 const confirmation=document.querySelector('#confirmation');if(confirmation)new MutationObserver(()=>{if(!confirmation.hidden){topic='stage';draw();}}).observe(confirmation,{attributes:true,attributeFilter:['hidden']});
 window.addEventListener('hashchange',()=>{current=null;lastKey='';interaction='';topic='stage';draw()});draw();
})();
