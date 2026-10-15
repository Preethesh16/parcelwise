const $ = selector => document.querySelector(selector);
const money = paise => '₹' + (Number(paise) / 100).toLocaleString('en-IN', {maximumFractionDigits: 2});
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const title = value => ({needs_attention:'Needs attention',needs_funding:'Awaiting funds',booked:'Booked',picked_up:'Picked up',in_transit:'In transit',out_for_delivery:'Out for delivery',awaiting_confirmation:'Awaiting customer',completed:'Completed',disputed:'Payout held',refunded:'Refunded'}[value] || value);
let catalog, productId, checkoutRequest;
const productPhotos = {
  bag: 'assets/products/weekender-bag.png',
  bottle: 'assets/products/daybreak-bottle.png',
  lamp: 'assets/products/evening-lamp.png'
};
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
  $('#products').innerHTML=catalog.products.map((p,i)=>`<article class="product"><div class="product-art ${esc(p.color)}"><span class="tag">${['A carry-everywhere classic','Your daily companion','A softer kind of evening'][i]}</span><img src="${productPhotos[p.id]}" alt="${esc(p.name)}" loading="lazy"></div><div class="product-info"><span class="eyebrow">${esc(p.category)}</span><div class="product-name"><h3>${esc(p.name)}</h3><strong>${money(p.price)}</strong></div><p>${esc(p.description)}</p><button data-buy="${p.id}">Make it yours <span>↗</span></button></div></article>`).join('');
  $('#checkout-city').innerHTML=catalog.cities.map(city=>`<option>${esc(city)}</option>`).join('');
  $('#checkout-city').value='Bengaluru';
}
function openCheckout(id) {
  const p=catalog.products.find(p=>p.id===id);productId=id;checkoutRequest=crypto.randomUUID();
  $('#checkout-form').reset();$('#checkout-city').value='Bengaluru';$('#checkout-error').textContent='';
  $('#checkout-product').innerHTML=`<div class="checkout-item"><div><b>${esc(p.name)}</b><small>${money(p.price)} each · Delivery arranged by the store</small></div><label>Qty<select name="quantity" id="quantity">${[1,2,3,4,5].map(n=>`<option>${n}</option>`).join('')}</select></label></div>`;
  $('#checkout-total').textContent=money(p.price);$('#checkout').showModal();
}

document.addEventListener('click',event=>{const b=event.target.closest('button');if(b?.dataset.buy)openCheckout(b.dataset.buy);if(b?.dataset.close)$('#'+b.dataset.close).close();});
$('#checkout-form').addEventListener('input',()=>{checkoutRequest=crypto.randomUUID();$('#checkout-total').textContent=money(catalog.products.find(p=>p.id===productId).price*Number($('#quantity').value));});
$('#checkout-form').addEventListener('submit',async event=>{
 event.preventDefault();const button=event.submitter;button.disabled=true;button.textContent='Confirming & opening Parcelwise…';$('#checkout-error').textContent='';
 const d=Object.fromEntries(new FormData(event.target));
 try{const result=await api('checkout',{productId,quantity:Number(d.quantity),customerName:d.customerName,address:{line1:d.line1,city:d.city,postalCode:d.postalCode},requestId:checkoutRequest});location.assign(result.redirectUrl);}
 catch(error){$('#checkout-error').textContent=error.message;button.disabled=false;button.textContent='Retry confirmation →';}
});
(async()=>{try{catalog=await api('catalog');renderProducts();}catch(error){toast(error.message);}})();
