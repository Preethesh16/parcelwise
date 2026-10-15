let orderPage=0,trendMetric='orders';
function portalIdentity(){
 const hash=location.hash.slice(1),match=hash.match(/(?:^|&)partner=([A-E])/);
 return match?'partner:'+match[1]:'company';
}
function renderPartnerDirectory(){
 $('#workspace').insertAdjacentHTML('beforeend','<section class="panel"><div class="eyebrow">Connected couriers</div><h2>Your delivery network</h2><p>Each partner negotiates independently within its own service rules.</p><div class="partner-directory">'+data.config.partners.map(p=>'<article><span class="badge">'+(p.enabled?'Connected':'Paused')+'</span><h3>'+esc(p.name)+'</h3><p>'+esc(p.tag)+'</p><strong>'+p.deliveryDays+'-day promise</strong><small>Up to '+p.maxWeight+' kg · '+(p.fragile?'Fragile handling':'Standard parcels')+'</small></article>').join('')+'</div></section>');
}
document.addEventListener('click',e=>{
 const direction=e.target.closest('[data-page]')?.dataset.page;
 if(direction){orderPage=Math.max(0,orderPage+(direction==='next'?1:-1));renderTable();}
});
let analyticsFilters={source:'',partner:'',from:'',to:'',status:''},analyticsSort='ontime',analyticsData=null;
function portalNav(){
 const nav=document.querySelector('.topbar nav'),partner=portalAccount?.startsWith('partner:'),pid=partner?portalAccount.split(':')[1]:null;
 if(!portalAccount||location.hash.startsWith('#track=')){nav.innerHTML='';return;}
 const root=partner?'partner='+pid:'platform',suffix=partner?'&partner='+pid:'';
 nav.innerHTML=[['#'+root,'Overview'],['#orders'+suffix,'Orders'],['#analytics'+suffix,'Analytics'],[partner?'#rules'+suffix:'#connections',partner?'Agent rules':'Partners & rules']].map(([href,label])=>'<a href="'+href+'" '+(location.hash===href?'aria-current="page"':'')+'>'+label+'</a>').join('');
}
function portalOrders(){return data.orders;}
function renderOverview(){
 const partner=portalAccount?.startsWith('partner:'),p=partner?data.config.partners[0]:null,rows=portalOrders(),m=metrics(rows);
 const activeRows=rows.filter(o=>!['completed','refunded'].includes(o.status)),latest=rows.slice(0,8);
 $('#workspace').innerHTML=head(partner?'Courier workspace':'Everyday · Seller workspace',partner?'Good deliveries start here.':'Every order. Taken care of.',partner?esc(p.name)+' · Your work, promises, and customer feedback.':'Your agents arrange delivery. You keep the whole picture.')+
 '<div class="kpis">'+kpi('Total orders',rows.length,'Across your delivery history')+kpi('In progress',activeRows.length,'From negotiation to receipt')+kpi('Delivered',m.done,'Completed and settled')+kpi('Customer rating',m.avg+'/5',m.rated.length+' reviews')+'</div>'+
 '<div class="grid-2"><section class="panel"><div class="eyebrow">Your next steps</div><h2>'+ (activeRows.length?'Deliveries in motion':'Everything is taken care of.')+'</h2><p>'+activeRows.length+' orders are progressing through dispatch and delivery.</p><a class="btn" href="#orders'+(partner?'&partner='+p.id:'')+'">View orders →</a></section><section class="panel dark-panel"><div class="eyebrow">Make better decisions</div><h2>See what delivers.</h2><p>Compare delivery promises, actual transit times, and what customers say.</p><a class="btn secondary" href="#analytics'+(partner?'&partner='+p.id:'')+'">Explore performance →</a></section></div>'+
 '<section class="panel"><div class="panel-title"><h2>Recent orders</h2><span class="subtle">Live updates · '+(rows.some(o=>o.source==='synthetic')?'Includes sample history':'Current orders')+'</span></div>'+orderTable(latest,partner)+'</section>';
}
function renderOrdersPage(){
 const partner=portalAccount?.startsWith('partner:');
 $('#workspace').innerHTML=head('Deliveries','The details, all together.','Search by customer, order, destination, or courier.')+
 '<section class="panel"><div class="filters"><input id="order-search" aria-label="Search orders" placeholder="Find an order…" value="'+esc(search)+'"><select id="status-filter" aria-label="Filter orders"><option value="all">All orders</option><option value="decision">Needs attention</option><option value="delivery">Active deliveries</option><option value="completed">Completed</option></select></div><div id="order-table"></div></section>';
 $('#status-filter').value=filter;renderTable();
}
function renderInsights(a){
 analyticsData=a;a.partners.sort((x,y)=>(y[analyticsSort]??-1)-(x[analyticsSort]??-1));const m=a.summary,partner=portalAccount?.startsWith('partner:'),fmt=v=>v==null?'—':v;
 const options=data.config.partners.map(p=>'<option value="'+p.id+'">'+esc(p.name)+'</option>').join('');
 $('#workspace').innerHTML=head('Performance intelligence','Know what works.','Delivery performance, customer experience, and the trends connecting them.')+
 '<section class="panel analytics-filters"><label>From<input type="date" data-analytics="from" value="'+esc(analyticsFilters.from)+'"></label><label>To<input type="date" data-analytics="to" value="'+esc(analyticsFilters.to)+'"></label>'+(!partner?'<label>Courier<select data-analytics="partner"><option value="">All couriers</option>'+options+'</select></label>':'')+
 '<label>Status<select data-analytics="status"><option value="">All statuses</option><option value="completed">Completed</option><option value="awaiting_confirmation">Awaiting receipt</option><option value="in_transit">In transit</option><option value="disputed">Disputed</option></select></label><label>History<select data-analytics="source"><option value="">All history</option><option value="checkout">Placed orders</option><option value="synthetic">Sample history</option></select></label><p class="subtle">'+a.syntheticCount+' sample deliveries included</p></section>'+
 '<div class="kpis">'+kpi('On-time delivery',fmt(m.ontime)+(m.ontime==null?'':'%'),m.timingSamples+' measured deliveries')+kpi('Average transit',fmt(m.transitDays)+' days','Simulated business time')+kpi('Customer rating',fmt(m.rating)+'/5',m.reviews+' submitted reviews')+kpi(partner?'Delivery earnings':'Shipping spend',money(partner?m.earnings:m.shippingSpend),m.orders+' orders in view')+'</div>'+
 '<div class="grid-2"><section class="panel"><div class="eyebrow">Over time</div><h2>How your deliveries are evolving</h2><div class="chart-controls">'+[['orders','Volume'],['ontime','On time'],['rating','Rating']].map(([key,label])=>'<button type="button" data-trend="'+key+'" aria-pressed="'+(trendMetric===key)+'">'+label+'</button>').join('')+'</div>'+trendChart(a.weeks)+'</section><section class="panel"><div class="eyebrow">Customer voice</div><h2>Ratings, at a glance</h2>'+[5,4,3,2,1].map(n=>bar(n+' stars',a.ratings[n],Math.max(1,m.reviews))).join('')+'<p class="subtle">Unrated orders are excluded from averages.</p></section></div>'+
 '<section class="panel"><div class="eyebrow">Compare service</div><h2>'+ (partner?'Your service outcomes':'Courier performance')+'</h2><label class="comparison-sort">Compare by<select id="analytics-sort"><option value="ontime">On-time rate</option><option value="rating">Customer rating</option><option value="orders">Order volume</option></select></label><div class="table-wrap"><table><thead><tr><th>Courier</th><th>Orders</th><th>On time</th><th>Transit</th><th>Rating</th><th>Avg. delay</th></tr></thead><tbody>'+a.partners.map(p=>'<tr><td><b>'+esc(p.name)+'</b></td><td>'+p.orders+'</td><td>'+fmt(p.ontime)+'%</td><td>'+fmt(p.transitDays)+' days</td><td>'+fmt(p.rating)+'/5<small>'+p.reviews+' reviews</small></td><td>'+fmt(p.delayDays)+' days</td></tr>').join('')+'</tbody></table></div></section>'+
 '<div class="grid-2"><section class="panel"><div class="eyebrow">Relationships</div><h2>Delay & customer satisfaction</h2>'+scatterChart(a.scatter)+'<p>'+(a.correlation==null?'Not enough varied observations to calculate a correlation.':'Correlation: '+a.correlation+' across '+a.correlationSamples+' rated deliveries. Negative values mean longer delays tend to accompany lower ratings.')+'</p><small>An association, not proof of cause. Bubble size represents the number of deliveries.</small></section><section class="panel"><div class="eyebrow">Route intelligence</div><h2>Where deliveries perform</h2>'+a.routes.map(r=>bar(r.route,r.ontime||0,100,'%')).join('')+'<p class="subtle">On-time rate by route; unknown transit times are excluded.</p></section></div>';
 $('#analytics-sort').value=analyticsSort;
 document.querySelectorAll('[data-analytics]').forEach(el=>el.value=analyticsFilters[el.dataset.analytics]||'');
}
function trendChart(weeks){
 const rows=weeks.filter(w=>w[trendMetric]!=null);
 if(!rows.length)return '<div class="empty">No measured deliveries for these filters.</div>';
 const max=trendMetric==='ontime'?100:trendMetric==='rating'?5:Math.max(1,...rows.map(w=>w.orders));
 const unit=trendMetric==='ontime'?'%':trendMetric==='rating'?'/5':' orders';
 const x=i=>52+i/Math.max(1,rows.length-1)*540,y=v=>205-v/max*160;
 const path=rows.map((w,i)=>(i?'L':'M')+x(i)+','+y(w[trendMetric])).join(' ');
 const title=trendMetric==='orders'?'Weekly order volume':trendMetric==='ontime'?'Weekly on-time rate':'Weekly customer rating';
 return '<svg class="trend-svg" viewBox="0 0 640 250" role="img" aria-label="'+title+'"><defs><linearGradient id="trend-shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#8fae7f" stop-opacity=".45"/><stop offset="100%" stop-color="#8fae7f" stop-opacity=".02"/></linearGradient></defs>'+
 [0,.25,.5,.75,1].map(n=>'<line x1="52" y1="'+y(n*max)+'" x2="592" y2="'+y(n*max)+'" stroke="#e6ecdf" stroke-dasharray="3 5"/><text x="38" y="'+(y(n*max)+4)+'" text-anchor="end">'+Math.round(n*max*10)/10+'</text>').join('')+
 '<path d="'+path+' L'+x(rows.length-1)+',205 L52,205 Z" fill="url(#trend-shade)"/><path class="trend-line" d="'+path+'" fill="none" stroke="#5f8353" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'+
 rows.map((w,i)=>'<g class="plot-point" tabindex="0" aria-label="'+esc(w.week)+': '+w[trendMetric]+unit+'"><circle cx="'+x(i)+'" cy="'+y(w[trendMetric])+'" r="11" fill="transparent"/><circle cx="'+x(i)+'" cy="'+y(w[trendMetric])+'" r="4" fill="#f7f8f3" stroke="#5f8353" stroke-width="2"/><title>'+esc(w.week)+': '+w[trendMetric]+unit+'</title><g class="plot-tooltip"><rect x="'+Math.min(475,Math.max(52,x(i)-65))+'" y="'+Math.max(5,y(w[trendMetric])-43)+'" width="117" height="30" rx="6" fill="#203d32"/><text x="'+(Math.min(475,Math.max(52,x(i)-65))+58)+'" y="'+Math.max(24,y(w[trendMetric])-23)+'" text-anchor="middle" fill="white">'+w[trendMetric]+unit+'</text></g></g>').join('')+
 '<text x="52" y="238">'+rows[0].week+'</text><text x="592" y="238" text-anchor="end">'+rows.at(-1).week+'</text></svg><details class="chart-data"><summary>View weekly figures</summary><div class="table-wrap"><table><thead><tr><th>Week</th><th>Orders</th><th>On time</th><th>Rating</th></tr></thead><tbody>'+rows.map(w=>'<tr><td>'+w.week+'</td><td>'+w.orders+'</td><td>'+(w.ontime??'—')+'%</td><td>'+(w.rating??'—')+'/5</td></tr>').join('')+'</tbody></table></div></details>';
}
function scatterChart(points){
 if(!points.length)return '<div class="empty">No rated deliveries with transit timing.</div>';
 const max=Math.max(1,...points.map(p=>p.delay)),bins=new Map();
 points.forEach(p=>{const key=p.delay+':'+p.rating;bins.set(key,{delay:p.delay,rating:p.rating,count:(bins.get(key)?.count||0)+1});});
 return '<svg class="scatter-chart" viewBox="0 0 460 250" role="img" aria-label="Delivery delay and customer rating. Circle size represents number of deliveries.">'+
 [1,2,3,4,5].map(n=>'<line x1="45" x2="425" y1="'+(205-(n-1)*42)+'" y2="'+(205-(n-1)*42)+'" stroke="#e5ebdf" stroke-dasharray="3 5"/><text x="18" y="'+(209-(n-1)*42)+'">'+n+'</text>').join('')+
 [...bins.values()].map(p=>'<circle class="correlation-dot" tabindex="0" aria-label="'+p.count+' deliveries: '+p.delay+' days late, '+p.rating+' stars" cx="'+(60+p.delay/max*340)+'" cy="'+(205-(p.rating-1)*42)+'" r="'+Math.min(25,4+Math.sqrt(p.count)*1.4)+'" fill="'+(p.delay?'#bb9163':'#71936a')+'" fill-opacity=".55" stroke="'+(p.delay?'#a47d53':'#597e52')+'"><title>'+p.count+' deliveries · '+p.delay+' days late · '+p.rating+'/5</title></circle>').join('')+
 '<text x="170" y="242">Delay (0–'+max+' days)</text></svg><div class="chart-legend"><span><i></i>On time</span><span><i class="late"></i>Delayed</span><span>Bubble size = deliveries</span></div>';
}
document.addEventListener('click',e=>{
 const metric=e.target.closest('[data-trend]')?.dataset.trend;
 if(metric){trendMetric=metric;renderInsights(analyticsData);}
});
document.addEventListener('change',e=>{
 if(e.target.id==='analytics-sort'){analyticsSort=e.target.value;renderInsights(analyticsData);return;}
 if(!e.target.dataset.analytics)return;
 analyticsFilters[e.target.dataset.analytics]=e.target.value;
 lastSignature='';refresh(true);
});
