// Focused checks for the browser's automatic escrow-to-map handoff.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('static/app.js', 'utf8');
const schedule = source.slice(source.indexOf('function scheduleMapDemo('), source.indexOf("document.addEventListener('click',event=>{const button=event.target.closest('#auto-follow')"));
const stop = source.slice(source.indexOf('function stopDelivery('), source.indexOf('async function refreshJourney('));
const timers = new Map(); let nextTimer = 0;
const context = vm.createContext({
  setTimeout: (fn, delay) => { const id=++nextTimer; timers.set(id,{fn,delay}); return id; },
  clearTimeout: id => timers.delete(id),
  location:{hash:'#order=PW-TEST'},
  lastOrder:{id:'PW-TEST',contract:{state:'funded'},stage:0},
  deliveryRunning:false,mapTransitionTimer:null,deliveryTimer:null,
  autoDeliveryStarted:new Set(),rendered:0,advanced:0,
});
vm.runInContext('function renderJourney(){rendered++;} function deliveryStep(){advanced++;}',context);
vm.runInContext(stop+schedule,context);
vm.runInContext('scheduleMapDemo(lastOrder);scheduleMapDemo(lastOrder);',context);
assert.equal(timers.size,1,'polling must not schedule multiple handoffs');
assert.equal([...timers.values()][0].delay,4200,'escrow animation gets time to finish');
vm.runInContext('stopDelivery()',context);
assert.equal(timers.size,0,'navigation or pause cancels pending handoff');
vm.runInContext('scheduleMapDemo(lastOrder)',context);
let callback=[...timers.values()][0].fn;timers.clear();callback();
assert.equal(context.rendered,1);assert.equal(context.deliveryRunning,true);
assert.equal(context.autoDeliveryStarted.has('PW-TEST'),true);
vm.runInContext('stopDelivery();scheduleMapDemo(lastOrder)',context);
assert.equal(timers.size,0,'a paused demo must not immediately auto-restart');
vm.runInContext("autoDeliveryStarted.clear();scheduleMapDemo(lastOrder);location.hash='#connections';",context);
callback=[...timers.values()][0].fn;timers.clear();callback();
assert.equal(context.rendered,1,'a stale handoff must not run after navigation');
vm.runInContext("location.hash='#order=PW-TEST';lastOrder.stage=4;scheduleMapDemo(lastOrder);",context);
assert.equal(timers.size,0,'reported delivery must not restart');
console.log('Automatic map handoff: scheduling, cancellation, pause and navigation checks passed.');

const focus = source.slice(source.indexOf('function journeyFocus('), source.indexOf('function renderJourney('));
vm.runInContext(focus,context);
const order={status:'bidding'};
assert.equal(context.journeyFocus(order,false),'bidding');
order.status='deal_finalized';order.winner={name:'Partner B'};
assert.equal(context.journeyFocus(order,false),'winner','selected partner must appear before contract');
order.contract={state:'created'};
assert.equal(context.journeyFocus(order,false),'contract');
order.contract.state='funded';
assert.equal(context.journeyFocus(order,false),'contract','funding animation finishes before map');
assert.equal(context.journeyFocus(order,true),'map');
console.log('Journey focus: negotiation → selected partner → contract → map passed.');
