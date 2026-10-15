// UI flow checks without external browser dependencies.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const listeners={},elements={},requests=[];
const element=()=>({innerHTML:'',value:'',textContent:'',hidden:true,open:false});
elements['#workspace']=element();elements['#toast']=element();elements['#order-table']=element();elements['#status-filter']=element();
const fixture={id:'PW-UI',status:'awaiting_seller',phase:8,stage:0,items:[{name:'Bag',quantity:1}],customerName:'Demo customer',sellerName:'Test store',origin:'Mumbai',destination:'Bengaluru',created:'2026-10-15',sellerAddress:{line1:'Pickup road'},customerAddress:{line1:'Drop road',postalCode:'560001'},weight:1,length:20,width:20,height:20,policy:{maxShipping:25000,maxDays:5,minReliability:90,priority:'balanced'},requirements:{maxDays:3,fragile:true},events:[],bids:[],offers:[],excluded:[],contract:null,feedback:null,customerToken:'test-token'};
const offer={id:'B',name:'Partner B',score:85,pricePaise:15000,openingPrice:18000,days:2,allReviews:1,routeReviews:1,quality:.9,reliability:.96};
const context=vm.createContext({
 console,location:{hash:'#order=PW-UI'},document:{activeElement:null,querySelector:s=>elements[s]||null,addEventListener:(name,fn)=>(listeners[name]??=[]).push(fn)},
 window:{addEventListener:()=>{}},setTimeout:()=>1,clearTimeout:()=>{},setInterval:()=>1,clearInterval:()=>{},
 fetch:async(url,opts)=>{requests.push({url,body:opts?.body&&JSON.parse(opts.body)});return {ok:true,json:async()=>url.includes('order-action')?{ok:true}:fixture};},
 fixture,offer,portalAccount:'company',portalIdentity:()=> 'company',portalNav:()=>{},
});
vm.runInContext(fs.readFileSync('static/journey-view.js','utf8'),context);
vm.runInContext(fs.readFileSync('static/workspace.js','utf8').replace(/\nroute\(\);\s*$/,''),context);
vm.runInContext('renderOrder(fixture)',context);
assert.match(elements['#workspace'].innerHTML,/Find suitable partners/);
assert.match(elements['#workspace'].innerHTML,/max="3"/);
assert.equal(requests.length,0,'rendering an order cannot book or advance it');
fixture.status='bidding';fixture.negotiationMode='local';
fixture.events=[{actor:'Company agent',kind:'counter',text:'Can you deliver for ₹150?',at:'2026-10-15T12:00:00Z'},{actor:'Partner B agent',kind:'offer',text:'Yes, within two days. <script>unsafe</script>',at:'2026-10-15T12:00:02Z'}];
vm.runInContext('renderOrder(fixture)',context);
assert.match(elements['#workspace'].innerHTML,/Negotiation room/);
assert.match(elements['#workspace'].innerHTML,/chat-seller/);
assert.match(elements['#workspace'].innerHTML,/chat-partner/);
assert.match(elements['#workspace'].innerHTML,/Seller agent/);
assert.match(elements['#workspace'].innerHTML,/Live · Updating/);
assert.match(elements['#workspace'].innerHTML,/Local policy-agent simulation/);
assert.doesNotMatch(elements['#workspace'].innerHTML,/<script>unsafe/);
assert.equal(requests.length,0,'chat must only display existing messages');
fixture.status='awaiting_selection';fixture.offers=[offer];fixture.recommended='B';
vm.runInContext('renderOrder(fixture)',context);
assert.match(elements['#workspace'].innerHTML,/Seller approval required/);
assert.match(elements['#workspace'].innerHTML,/data-select="B"/);
assert.match(elements['#workspace'].innerHTML,/Ready for your decision/);
assert.match(elements['#workspace'].innerHTML,/Can you deliver for ₹150/);
(async()=>{
 const button={type:'submit',disabled:false,dataset:{select:'B'},closest:()=>null,hasAttribute:n=>n==='data-select'};
 await listeners.click[0]({target:{closest:()=>button}});
 assert.equal(requests[0].body.action,'select');
 assert.equal(requests[0].body.partnerId,'B');
 assert.equal(requests[0].body.id,'PW-UI');
 assert.equal(requests.filter(r=>r.body?.action==='advance').length,0);
 context.location.hash='#track=test-token';
 fixture.stage=4;fixture.status='awaiting_confirmation';fixture.winner=offer;
 vm.runInContext('renderCustomer(fixture)',context);
 assert.match(elements['#workspace'].innerHTML,/I received my parcel/);
 assert.match(elements['#workspace'].innerHTML,/id="feedback"/);
 assert.match(elements['#workspace'].innerHTML,/textarea name="comment"/);
 fixture.feedback={rating:4,comment:'Good delivery',ontime:1,success:1};
 vm.runInContext('renderCustomer(fixture)',context);
 assert.doesNotMatch(elements['#workspace'].innerHTML,/id="feedback"/);
 assert.match(elements['#workspace'].innerHTML,/Good delivery/);
 console.log('UI approval, customer constraints, selection action and feedback states passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});

// Automatic customer scenes must expose the winner and funded escrow before tracking.
for (const [fields, expected] of [
 [{status:'received',stage:0},'broadcast'],
 [{status:'bidding',stage:0},'negotiation'],
 [{status:'deal_finalized',stage:0,winner:offer},'winner'],
 [{status:'booked',stage:0,winner:offer,contract:{state:'funded'}},'contract'],
 [{status:'picked_up',stage:1,winner:offer,contract:{state:'funded'}},'delivery'],
]) {
 context.stageFixture=fields;
 assert.equal(vm.runInContext('customerStage(stageFixture)',context),expected);
}
