let portalAccount=null;
function showLogin(partner=false){
 const nav=document.querySelector('nav[aria-label="Workspaces"]');if(nav)nav.innerHTML='';
 document.querySelector('#workspace').innerHTML='<section class="panel" style="max-width:520px;margin:6vh auto"><a class="back" href="/store">← Back to Parcelwise</a><div class="eyebrow">'+(partner?'Delivery partner':'Seller')+' access</div><h1 style="font-size:44px;margin:18px 0">Welcome back.</h1><p>'+(partner?'Manage your deliveries, service profile and feedback.':'Manage orders, delivery performance, and your agent’s rules.')+'</p><form id="portal-login"><label>Account<select name="account">'+(partner?['A','B','C','D','E'].map(p=>'<option value="partner:'+p+'">'+({A:'Blue Dart',B:'Delhivery',C:'Shiprocket',D:'Ekart Logistics',E:'FedEx'}[p])+'</option>').join(''):'<option value="company">Everyday Store · Seller</option>')+'</select></label><label style="display:block;margin:20px 0">Access key<input name="key" type="password" autocomplete="current-password" required placeholder="Enter your account access key"></label><button class="btn yellow" type="submit">Sign in →</button><p id="login-error" class="error" role="alert"></p></form><details style="margin-top:24px"><summary>Local demo sign-in details</summary><p>'+(partner?'Blue Dart: demo-partner-A-key<br>Delhivery: demo-partner-B-key<br>Shiprocket: demo-partner-C-key<br>Ekart Logistics: demo-partner-D-key<br>FedEx: demo-partner-E-key':'Seller: demo-company-key')+'</p><small>Shared demo accounts only. Do not use for production or real customer data.</small></details><p><a href="#login='+(partner?'seller':'partner')+'">'+(partner?'Seller':'Delivery partner')+' sign in →</a></p></section>';
 document.querySelector('#portal-login').addEventListener('submit',async e=>{
  e.preventDefault();const button=e.submitter;button.disabled=true;
  try{const values=Object.fromEntries(new FormData(e.target));const result=await api('login',values);portalAccount=result.account;location.hash=result.account==='company'?'platform':'partner='+result.account.split(':')[1];}
  catch(error){document.querySelector('#login-error').textContent=error.message;}finally{button.disabled=false;}
 });
}
async function portalGate(hash){
 if(!hash){location.replace('/store');return false;}
 const session=await api('session');portalAccount=session.account;
 const logout=document.querySelector('#portal-logout');if(logout)logout.hidden=!portalAccount||hash.startsWith('track=')||hash.startsWith('login=');
 if(hash.startsWith('track='))return true;
 if(hash.startsWith('login=')){showLogin(hash==='login=partner');return false;}
 const isPartner=hash.startsWith('partner=')||hash.includes('&partner=');
 if(!portalAccount||(isPartner?portalAccount==='company':portalAccount!=='company')){location.hash='login='+(isPartner?'partner':'seller');return false;}
 if(isPartner){const pid=portalAccount.split(':')[1];if(hash.startsWith('partner=')&&hash!=='partner='+pid){location.hash='partner='+pid;return false;}if(hash.includes('&partner=')&&!hash.endsWith('&partner='+pid)){location.hash='partner='+pid;return false;}}
 return true;
}
document.querySelector('#portal-logout').addEventListener('click',async()=>{await api('logout',{});portalAccount=null;location.href='/store';});
