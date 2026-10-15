let journeyScene=null;
function customerStage(o){
 if(o.stage>0||['completed','disputed','awaiting_confirmation'].includes(o.status))return 'delivery';
 if(o.contract)return 'contract';
 if(o.winner)return 'winner';
 if(o.status==='bidding')return 'negotiation';
 return 'broadcast';
}
function renderCustomer(o){
 if(!o.automatic){renderReceipt(o);return;}
 const scene=customerStage(o),w=o.winner,c=o.contract;
 const steps=['broadcast','negotiation','winner','contract','delivery'],names=['Connect','Negotiate','Choose','Secure','Deliver'];
 const current=steps.indexOf(scene),previous=journeyScene;
 const receipt=o.stage===4;
 const chat=$('#agent-chat'),chatTop=chat?.scrollTop||0,follow=!chat||chat.scrollHeight-chat.scrollTop-chat.clientHeight<70;
 disposeMap();
 $('#workspace').innerHTML='<div class="customer-journey"><div class="journey-heading"><span class="eyebrow">EVERYDAY × PARCELWISE</span><span class="subtle">'+esc(o.id)+'</span></div><nav class="journey-steps" aria-label="Delivery progress">'+steps.map((s,i)=>'<span class="'+(i===current?'current':i<current?'done':'')+'"><i>'+(i<current?'✓':i+1)+'</i>'+names[i]+'</span>').join('')+'</nav>'+
 '<section class="journey-scene" id="customer-scene">'+
 (scene==='broadcast'?'<div class="scene-intro"><span class="eyebrow">01 / A CONNECTED NETWORK</span><h1>One order.<br>A world of possibilities.</h1><p>Your parcel details are being shared with available delivery partners.</p></div><div class="network-stage"><div class="network-hub"><span>✳</span><b>Everyday</b><small>'+esc(o.origin)+' → '+esc(o.destination)+'</small></div><div class="network-arcs"><i></i><i></i><i></i></div><div class="network-partners">'+(o.partners||[]).map(p=>'<div><span class="network-dot"></span><b>'+esc(p.name)+'</b><small>'+(!p.enabled?'Paused':o.status==='received'?'Connecting…':'Request received ✓')+'</small></div>').join('')+'</div></div>':
 scene==='negotiation'?'<div class="scene-intro"><span class="eyebrow">02 / AGENTS AT WORK</span><h1>A better deal, together.</h1><p>Your seller’s agent and courier agents negotiate within their saved policies.</p></div>'+negotiationChat(o,true):
 scene==='winner'?'<div class="scene-intro"><span class="eyebrow">03 / THE RIGHT MATCH</span><h1>'+esc(w.name)+' will take it from here.</h1><p>The strongest '+esc(o.policy.priority)+' match within your seller’s budget and delivery deadline.</p></div><div class="winner-reveal"><div class="winner-seal">✓</div><span class="eyebrow">YOUR DELIVERY PARTNER</span><h2>'+esc(w.name)+'</h2><div class="winner-facts"><div><strong>'+money(w.pricePaise)+'</strong><small>Agreed delivery cost</small></div><div><strong>'+w.days+' days</strong><small>Delivery promise</small></div><div><strong>'+money(w.openingPrice-w.pricePaise)+'</strong><small>Negotiated saving</small></div></div><p>Agreement preparation begins automatically.</p></div>':
 scene==='contract'?'<div class="scene-intro"><span class="eyebrow">04 / A PROMISE, SECURED</span><h1>Agreed. Signed. Protected.</h1><p>The delivery terms are fixed. Payment stays protected until you confirm receipt.</p></div>'+escrowScene(o):
 '<div class="scene-intro"><span class="eyebrow">05 / THE FINAL STRETCH</span><h1>'+(o.status==='completed'?'Delivered. And taken care of.':receipt?'Your parcel has arrived.':'Good things are on their way.')+'</h1><p>'+esc(w?.name||'Your courier')+' · '+esc(o.origin)+' → '+esc(o.destination)+'</p></div><div class="delivery-shell"><div class="delivery-topline"><b>'+esc(labels[o.status]||o.status)+'</b><span>'+w.days+'-day promise</span></div><div id="delivery-map" aria-label="Simulated delivery route map"></div><p id="map-caption" class="subtle">Accelerated city-to-city simulation · OpenStreetMap</p><div class="delivery-milestones">'+['Booked','Picked up','In transit','Near you','Arrived'].map((x,i)=>'<span class="'+(i<=o.stage?'reached':'')+'">'+(i<o.stage?'✓':'●')+' '+x+'</span>').join('')+'</div></div><div class="escrow-status">'+(c?.state==='released'?'✓ '+money(c.terms.amount)+' released to '+esc(w.name):c?.state==='disputed'?'Payment held while your issue is reviewed.':'◈ '+money(c?.terms.amount||0)+' secured in escrow until you confirm receipt.')+'</div>')+
 (['needs_attention','needs_funding'].includes(o.status)?'<div class="note">Your seller needs to review this shipment before it can continue. No delivery will proceed without secured payment.</div>':'')+'</section>'+
 (o.status==='awaiting_confirmation'?'<section class="panel receipt-panel"><h2>Made it to your door?</h2><p>Confirm receipt to release the delivery payment.</p><div class="actions"><button class="btn yellow" data-customer="confirm">Yes, I received it →</button><button class="btn secondary" data-customer="dispute">Report an issue</button></div></section>':'')+
 (receipt&&!o.feedback?'<form id="feedback" class="panel"><div class="eyebrow">YOUR EXPERIENCE MATTERS</div><h2>How was your delivery?</h2><div class="form-grid"><label>Rating<select name="rating">'+[5,4,3,2,1].map(n=>'<option value="'+n+'">'+n+' / 5</option>').join('')+'</select></label><label>On time?<select name="ontime"><option value="true">Yes</option><option value="false">No</option></select></label><label>Correct parcel?<select name="success"><option value="true">Yes</option><option value="false">No</option></select></label><label class="full">Your review<textarea name="comment" maxlength="500" placeholder="Tell us how it went"></textarea></label></div><button class="btn yellow">Send review →</button><p id="form-error" class="error"></p></form>':'')+
 (o.feedback?'<section class="panel"><h2>Thank you for sharing.</h2><strong>'+o.feedback.rating+'/5</strong><p>'+esc(o.feedback.comment)+'</p></section>':'')+
 '<details class="panel"><summary>Your order & journey history</summary><p>'+esc(o.items.map(i=>i.quantity+' × '+i.name).join(', '))+'</p>'+(o.events||[]).map(e=>'<p><b>'+esc(e.actor)+'</b> · '+esc(e.text)+'</p>').join('')+'</details><p class="journey-footnote">Payments and delivery tracking are simulated.</p></div>';
 order=o;journeyScene=scene;
 if($('#delivery-map'))renderMap(o);
 const newChat=$('#agent-chat');if(newChat)newChat.scrollTop=follow?newChat.scrollHeight:chatTop;
 if(previous&&previous!==scene)document.querySelector('#customer-scene')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
}
function escrowScene(o){
 const c=o.contract,w=o.winner;
 return '<div class="escrow-scene"><article class="agreement-paper"><span class="eyebrow">DELIVERY AGREEMENT</span><h2>Everyday × '+esc(w.name)+'</h2><dl><dt>Delivery fee</dt><dd>'+money(w.pricePaise)+'</dd><dt>Delivery promise</dt><dd>'+w.days+' days</dd><dt>Payment release</dt><dd>After customer receipt</dd></dl><div class="signed-stamp">✓ Terms finalized</div><small>'+esc(c.id)+'</small></article><div class="funding-scene"><div class="funding-wallet"><span>▣</span><b>Everyday wallet</b></div><div class="transfer-path"><i>₹</i><i>₹</i><i>₹</i></div><div class="funding-vault"><span>◈</span><h2>'+money(w.pricePaise)+'</h2><p>'+ (c.state==='funded'?'Funds secured ✓':'Securing escrow')+'</p></div></div></div>';
}
