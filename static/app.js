const $ = selector => document.querySelector(selector);
const money = value => '₹' + value.toLocaleString('en-IN');
const pct = value => (value * 100).toFixed(1) + '%';
let currentQuote = null, allShipments = [], feedbackId = null, requestNumber = 0;
let customerId = null, booking = false;

async function api(path, data) {
  const response = await fetch('/api/' + path, data ? {
    cache: 'no-store', method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)
  } : {cache: 'no-store'});
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Please try again.');
  return body;
}
function toast(message) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $('#toast').hidden = true, 4500);
}
function showPage(page) {
  for (const name of ['compare', 'shipments', 'method', 'customer']) $('#' + name).hidden = name !== page;
  document.querySelectorAll('nav button').forEach(button => button.classList.toggle('active', button.dataset.page === page));
  if (page === 'shipments') loadShipments().catch(error => toast(error.message));
  window.scrollTo(0, 0);
}
function formData() {
  return {...Object.fromEntries(new FormData($('#quote-form'))), priority: $('#priority').value};
}
async function compare(scroll = true) {
  if (!$('#quote-form').reportValidity()) return;
  const number = ++requestNumber;
  const button = $('#quote-form button[type="submit"]');
  button.disabled = true;
  button.textContent = 'Finding your options…';
  currentQuote = null;
  document.querySelectorAll('[data-book]').forEach(b => b.disabled = true);
  try {
    const quote = await api('quotes', formData());
    if (number !== requestNumber) return;
    currentQuote = quote;
    renderQuotes(quote);
    $('#results').hidden = false;
    if (scroll) $('#results').scrollIntoView({block: 'start'});
  } catch (error) {
    if (number !== requestNumber) return;
    $('#results').hidden = false;
    $('#cards').innerHTML = '<div class="notice">We couldn’t get your options. Check the details and try again.</div>';
    $('#excluded').textContent = '';
    $('#route-summary').textContent = '';
    toast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = 'Find delivery partners →';
  }
}
function renderQuotes(quote) {
  $('#route-summary').textContent = `${quote.shipment.origin} → ${quote.shipment.destination} · ${quote.billableWeight} kg charged weight`;
  const reasons = {
    balanced: 'Our pick for a balance of price, delivery time and care.',
    price: 'Our pick when keeping the delivery cost down matters most.',
    speed: 'Our pick when getting there sooner matters most.',
    reliability: 'Our pick when dependable delivery and care matter most.'
  };
  $('#cards').innerHTML = quote.partners.length ? quote.partners.map((partner, index) => `
    <article class="carrier ${index === 0 ? 'best' : ''}">
      <div class="recommend">${index === 0 ? '✓ Recommended for you' : partner.label}</div>
      <div class="carrier-body">
        <div class="carrier-top"><div class="carrier-logo ${partner.id}">${partner.id}</div><div class="carrier-title"><h3>${partner.name}</h3><small>Delivery company</small></div></div>
        <div class="price">${money(partner.price)}<small>total</small></div>
        <div class="deal">${partner.discount ? `${money(partner.discount)} saved · offer included` : 'All charges included'}</div>
        <div class="metrics">
          <div><small>Arrives in</small><strong>${partner.days} ${partner.days === 1 ? 'day' : 'days'}</strong></div>
          <div><small>On-time deliveries</small><strong>${pct(partner.ontime)}</strong></div>
          <div><small>Parcel care</small><strong>${(1 + partner.quality * 4).toFixed(1)} / 5 ★</strong></div>
        </div>
        <p class="why">${index === 0 ? reasons[quote.shipment.priority] : partner.id === 'A' ? 'An affordable option for everyday parcels.' : partner.id === 'B' ? 'A quicker option for time-sensitive parcels.' : 'A dependable option with strong parcel-care ratings.'}</p>
        <button class="${index === 0 ? 'primary' : 'secondary'}" data-book="${partner.id}">Choose ${partner.name}</button>
        <details><summary>Delivery details</summary><p>${pct(partner.success)} successful deliveries. ${partner.routeReviews} customer response(s) on this route. Estimates include simulated historical performance.</p><p>Price uses the higher of actual and size-based weight. Transit is estimated in calendar days.</p></details>
      </div>
    </article>`).join('') : '<div class="panel empty"><h2>No delivery options yet</h2><p>Try a smaller parcel or another route.</p></div>';
  $('#excluded').innerHTML = quote.excluded.map(p => `<div class="excluded">${p.name}: ${p.reason}.</div>`).join('');
}
function shipmentCard(shipment, customer = false) {
  const stages = ['Booked', 'Picked up', 'In transit', 'Out for delivery', 'Delivered'];
  return `<article class="panel shipment">
    <div class="shipment-heading"><div><div class="eyebrow">${shipment.id} · ${shipment.partner.name}</div><h3>${shipment.origin} → ${shipment.destination}</h3><small>${customer ? 'Estimated transit: ' + shipment.partner.days + ' days' : money(shipment.partner.price) + ' · ' + shipment.weight + ' kg parcel'}</small></div><span class="pill">${shipment.status}</span></div>
    <div class="timeline">${stages.map((stage, i) => `<div class="${i <= shipment.stage ? 'done' : ''}">${i <= shipment.stage ? '●' : '○'} ${stage}</div>`).join('')}</div>
    <div class="shipment-actions"><p>${shipment.feedback ? 'Thanks! Your feedback has been saved.' : shipment.stage === 4 ? (customer ? 'Your parcel has arrived. How was the delivery?' : 'Delivered. Your customer can now leave feedback.') : 'Your parcel is on its way through the delivery process.'}</p>
    ${customer ? (shipment.stage === 4 && !shipment.feedback ? `<button class="primary" data-feedback="${shipment.id}">Rate this delivery</button>` : '') : `<a class="customer-link" href="#track=${shipment.id}">Open customer view →</a>`}</div>
    ${customer ? '<button class="text-button" data-refresh>Refresh tracking</button>' : shipment.stage < 4 ? `<details class="demo-controls"><summary>Try demo tracking</summary><p>Move to the next stage to test this simulated delivery.</p><button class="secondary" data-advance="${shipment.id}">Next delivery stage →</button></details>` : ''}
  </article>`;
}
async function loadShipments() {
  allShipments = await api('shipments');
  $('#count').textContent = allShipments.length;
  $('#shipment-list').innerHTML = allShipments.length ? allShipments.map(s => shipmentCard(s)).join('') : '<div class="panel empty"><h2>No deliveries yet</h2><p>Choose a partner to send your first parcel.</p><button class="primary" data-page="compare">Send a parcel →</button></div>';
}
async function loadCustomer() {
  try {
    const shipment = await api('shipments/' + encodeURIComponent(customerId));
    $('#customer-shipment').innerHTML = shipmentCard(shipment, true);
  } catch (error) {
    $('#customer-shipment').innerHTML = '<div class="notice">This delivery couldn’t be loaded. Check the link or refresh to try again.</div><button class="text-button" data-refresh>Try again</button>';
  }
}
async function route() {
  const match = location.hash.match(/^#track=(PW-[A-F0-9]+)$/);
  customerId = match ? match[1] : null;
  document.body.classList.toggle('customer-mode', !!customerId);
  if (customerId) {showPage('customer'); await loadCustomer();}
  else showPage('compare');
}
document.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.page) {showPage(button.dataset.page); return;}
  try {
    if (button.dataset.book) {
      if (!currentQuote || booking) return;
      booking = true;
      document.querySelectorAll('[data-book]').forEach(b => b.disabled = true);
      await api('shipments', {...currentQuote.shipment, partner: button.dataset.book});
      toast('You’re all set. Your delivery has been booked.');
      showPage('shipments');
    }
    if (button.dataset.advance) {
      button.disabled = true;
      await api('advance', {id: button.dataset.advance});
      await loadShipments();
    }
    if (button.hasAttribute('data-refresh')) {button.disabled = true; await loadCustomer();}
    if (button.dataset.feedback) {
      feedbackId = button.dataset.feedback;
      $('#feedback-route').textContent = 'A few quick details about your delivery.';
      $('#feedback-form').reset();
      $('#feedback-dialog').showModal();
    }
  } catch (error) {toast(error.message);}
  finally {
    booking = false;
    button.disabled = false;
    document.querySelectorAll('[data-book]').forEach(b => b.disabled = !currentQuote);
  }
});
$('#quote-form').addEventListener('submit', event => {event.preventDefault(); compare();});
$('#quote-form').addEventListener('input', () => {
  requestNumber++;
  currentQuote = null;
  $('#results').hidden = true;
  const form = new FormData($('#quote-form'));
  $('.parcel-details summary span').textContent = `${form.get('length')} × ${form.get('width')} × ${form.get('height')} cm · change`;
});
$('#priority').addEventListener('change', () => compare(false));
$('#cancel-feedback').onclick = () => $('#feedback-dialog').close();
$('#feedback-form').onsubmit = async event => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  const data = Object.fromEntries(new FormData(event.target));
  try {
    await api('feedback', {id: feedbackId, rating: Number(data.rating), ontime: data.ontime === 'true', success: data.success === 'true'});
    $('#feedback-dialog').close();
    if (customerId) await loadCustomer();
    else await loadShipments();
    currentQuote = null;
    $('#results').hidden = true;
    toast('Thank you! Your feedback helps improve future deliveries.');
  } catch (error) {toast(error.message);}
  finally {button.disabled = false;}
};
window.addEventListener('hashchange', route);
(async () => {
  try {
    const meta = await api('meta');
    for (const id of ['origin', 'destination']) $('#' + id).innerHTML = meta.cities.map(city => `<option>${city}</option>`).join('');
    $('#origin').value = 'Mumbai';
    $('#destination').value = 'Bengaluru';
    await route();
    if (!customerId) await loadShipments();
  } catch (error) {toast('Could not connect. Refresh to try again.');}
})();
