let portalAccount=null, storefrontUrl='http://localhost:8000';
const demoAccounts={company:{name:'Everyday Store',key:'demo-company-key',route:'platform'},'partner:A':{name:'Fedx',key:'demo-partner-A-key',route:'partner=A'},'partner:B':{name:'Delhivery',key:'demo-partner-B-key',route:'partner=B'},'partner:C':{name:'Shiprocket',key:'demo-partner-C-key',route:'partner=C'}};
function portalNavigation(){
 const account=demoAccounts[portalAccount];
 document.querySelector('#company-wallet').hidden=portalAccount!=='company';
 document.querySelector('#company-wallet').open=false;
 document.querySelector('#portal-nav').innerHTML=(portalAccount==='company'?'<a href="#platform" '+(location.hash==='#platform'?'aria-current="page"':'')+'>Current orders</a><a href="#analytics" '+(location.hash==='#analytics'?'aria-current="page"':'')+'>Analytics</a>':account?'<a href="#'+account.route+'">'+account.name+' dashboard</a>':'<a href="#login=seller">Everyday Store</a><a href="#login=partner">Delivery partners</a>');
 document.querySelector('[data-store-link]').href=storefrontUrl+'/';
}
function showLogin(partner=false,selected=null){
 const accounts=partner?Object.entries(demoAccounts).filter(([id])=>id!=='company'):[['company',demoAccounts.company]];
 document.querySelector('#workspace').innerHTML='<section class="panel" style="max-width:760px;margin:5vh auto"><a class="back" href="'+storefrontUrl+'/">← Back to Parcelwise</a><div class="eyebrow">Separate demo workspaces</div><h1 style="font-size:44px;margin:18px 0">'+(partner?'Delivery partner login':'Everyday Store login')+'</h1><p>'+(partner?'Each carrier has its own deliveries, service policies and customer feedback.':'Orders and delivery addresses arrive here automatically from Everyday Store checkout.')+'</p><div class="actions">'+accounts.map(([id,a])=>'<a class="btn secondary" href="#login='+ (id==='company'?'seller':id.split(':')[1])+'">'+a.name+'</a>').join('')+'</div><form id="portal-login"><label style="display:block;margin-top:24px">Account<select name="account">'+accounts.map(([id,a])=>'<option value="'+id+'" '+(id===selected?'selected':'')+'>'+a.name+'</option>').join('')+'</select></label><label style="display:block;margin:20px 0">Demo access key<input name="key" type="password" autocomplete="current-password" required placeholder="Enter the demo access key below"></label><button class="btn yellow" type="submit">Sign in to dashboard →</button><p id="login-error" class="error" role="alert"></p></form><div class="note"><strong>Demo login credentials</strong>'+accounts.map(([id,a])=>'<p>'+a.name+': <code>'+a.key+'</code></p>').join('')+'<small>Simulated carrier accounts; no live carrier connection.</small></div><p><a href="#login='+(partner?'seller':'partner')+'">'+(partner?'Everyday Store seller':'Delivery partner')+' sign in →</a></p></section>';
 document.querySelector('#portal-login').addEventListener('submit',async e=>{
  e.preventDefault();const button=e.submitter;button.disabled=true;
  try{const values=Object.fromEntries(new FormData(e.target));const result=await api('login',values);portalAccount=result.account;sessionStorage.setItem('parcelwiseAccount',portalAccount);location.hash=demoAccounts[portalAccount].route;}
  catch(error){document.querySelector('#login-error').textContent=error.message;}finally{button.disabled=false;}
 });
}
async function portalGate(hash){
 const config=await api('portal-config');storefrontUrl=config.storefrontUrl;
 const session=await api('session');portalAccount=session.account;portalNavigation();
 const logout=document.querySelector('#portal-logout');if(logout)logout.hidden=!portalAccount;
 if(hash.startsWith('track='))return true;
 if(!hash){location.hash=portalAccount?demoAccounts[portalAccount].route:'login=seller';return false;}
 if(hash.startsWith('login=')){const choice=hash.slice(6);showLogin(choice!=='seller',demoAccounts['partner:'+choice]?'partner:'+choice:null);return false;}
 const isPartner=hash.startsWith('partner=')||hash.includes('&partner=');
 if(!portalAccount||(isPartner?portalAccount==='company':portalAccount!=='company')){const pid=hash.startsWith('partner=')?hash.slice(8):hash.split('&partner=')[1];location.hash='login='+(isPartner?(pid||'partner'):'seller');return false;}
 if(isPartner){const pid=portalAccount.split(':')[1];if(hash.startsWith('partner=')&&hash!=='partner='+pid){location.hash='partner='+pid;return false;}if(hash.includes('&partner=')&&!hash.endsWith('&partner='+pid)){location.hash='partner='+pid;return false;}}
 return true;
}
document.querySelector('#portal-logout').addEventListener('click',async()=>{await api('logout',{});sessionStorage.removeItem('parcelwiseAccount');portalAccount=null;location.hash='login=seller';});
