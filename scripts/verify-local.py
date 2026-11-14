#!/usr/bin/env python3
"""Exercise the real server and isolated DB. Mutations require explicit opt-in and the designated test credentials."""
import os, json, urllib.request, urllib.parse, urllib.error, http.cookiejar, secrets, hashlib, base64
base=os.environ.get('BASE_URL','http://localhost:3000')
jar=http.cookiejar.CookieJar()
if os.environ.get('VERCEL_PREVIEW_COOKIE'):
 for part in os.environ['VERCEL_PREVIEW_COOKIE'].split('; '):
  name,value=part.split('=',1)
  jar.set_cookie(http.cookiejar.Cookie(0,name,value,None,False,urllib.parse.urlsplit(base).hostname,False,False,'/',True,True,None,True,None,None,{}))
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs): return None
opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar),NoRedirect())
def req(path,body=None,token=None,form=False,method=None):
 data=None if body is None else urllib.parse.urlencode(body).encode() if form else json.dumps(body).encode()
 h={'Origin':base,'Content-Type':'application/x-www-form-urlencoded' if form else 'application/json','Accept':'application/json, text/event-stream'}
 if token:h['Authorization']='Bearer '+token
 if path.startswith('/api/mcp'):h['MCP-Protocol-Version']='2025-11-25'
 r=urllib.request.Request(base+path,data=data,headers=h,method=method)
 try: response=opener.open(r,timeout=60)
 except urllib.error.HTTPError as e:response=e
 raw=response.read().decode()
 if path.startswith('/api/mcp') and response.code>=400:
  safe=raw.replace(token or 'NO_TOKEN','[REDACTED]')
  for key in ['APPFOLIO_TEST_CLIENT_ID','APPFOLIO_TEST_CLIENT_SECRET','APPFOLIO_TEST_DATABASE_ID','APPFOLIO_TEST_DEVELOPER_ID']:
   safe=safe.replace(os.environ.get(key,'NOT_SET'),'[REDACTED]')
  print('MCP failure diagnostic: '+safe[:500],flush=True)
 try:value=json.loads(raw)
 except ValueError:
  messages=[json.loads(line[5:].strip()) for line in raw.splitlines() if line.startswith('data:')]
  value=messages[-1] if messages else {'nonJsonResponse':True}
 global last_error
 last_error=value.get('error','none') if isinstance(value,dict) else 'unknown'
 return response.code,value,response.headers

def check(condition,label):
 if not condition:raise RuntimeError(label+'; last status='+str(status)+'; error='+str(last_error))
 print('PASS '+label,flush=True)

password=secrets.token_urlsafe(24)
status,user,_=req('/api/auth/sign-up/email',{'email':'verification-'+secrets.token_hex(5)+'@example.com','password':password,'name':'Verification'})
check(status==200,'signup creates account and session')
creds={k:os.environ[v] for k,v in {'clientId':'APPFOLIO_TEST_CLIENT_ID','clientSecret':'APPFOLIO_TEST_CLIENT_SECRET','databaseId':'APPFOLIO_TEST_DATABASE_ID','developerId':'APPFOLIO_TEST_DEVELOPER_ID'}.items()}
status,c,_=req('/api/account',{'action':'create','connection':dict(name='Verification connection',**creds)})
check(status==200 and 'id' in c,'create encrypted AppFolio connection')
connection=c['id']
status,account,_=req('/api/account')
check(status==200 and len(account['connections'])==1 and 'clientSecret' not in json.dumps(account),'settings hide credential values')
status,client,_=req('/api/auth/oauth2/register',{'application_type':'native','client_name':'Verification agent','redirect_uris':['http://127.0.0.1:38219/callback'],'token_endpoint_auth_method':'none','grant_types':['authorization_code','refresh_token'],'response_types':['code'],'scope':'mcp:tools offline_access'})
check(status in (200,201) and 'client_id' in client,'dynamic public client registration')
client_id=client['client_id']
verifier=secrets.token_urlsafe(48)
challenge=base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
params={'client_id':client_id,'redirect_uri':'http://127.0.0.1:38219/callback','response_type':'code','code_challenge':challenge,'code_challenge_method':'S256','state':secrets.token_hex(12),'scope':'mcp:tools offline_access','resource':base+'/api/mcp'}
status,authorization,h=req('/api/auth/oauth2/authorize?'+urllib.parse.urlencode(params))
authorization_url=h.get('Location') or authorization.get('url','')
check(status in (200,302) and '/select-connection?' in authorization_url,'authorize requires explicit connection selection')
oauth=urllib.parse.urlsplit(authorization_url).query
status,selected,_=req('/api/account',{'action':'select','connectionId':connection,'oauthQuery':oauth})
check(status==200 and '/consent?' in selected.get('url',''),'selection resumes signed PKCE flow')
old_params=urllib.parse.parse_qs(oauth)
oauth=urllib.parse.urlsplit(selected['url']).query
new_params=urllib.parse.parse_qs(oauth)
print('Flow parameter changes: '+str([k for k in set(old_params)|set(new_params) if old_params.get(k)!=new_params.get(k)]),flush=True)
status,consent,_=req('/api/account',{'action':'consent','accept':True,'oauthQuery':oauth})
check(status==200 and 'url' in consent,'consent produces redirect')
callback=urllib.parse.parse_qs(urllib.parse.urlsplit(consent['url']).query)
check('code' in callback and callback.get('state')==[params['state']],'callback returns code and original state')
status,tokens,_=req('/api/auth/oauth2/token',{'grant_type':'authorization_code','client_id':client_id,'code':callback['code'][0],'redirect_uri':params['redirect_uri'],'code_verifier':verifier,'resource':base+'/api/mcp'},form=True)
check(status==200 and 'access_token' in tokens and 'refresh_token' in tokens,'PKCE code exchange issues bound access and refresh tokens')
token=tokens['access_token']
import pathlib
state=pathlib.Path('/tmp/mcp-verification-state.json');state.write_text(json.dumps({'tokens':tokens,'clientId':client_id,'connectionId':connection}));state.chmod(0o600)
status,listed,_=req('/api/mcp',{'jsonrpc':'2.0','id':1,'method':'tools/list','params':{}},token)
print('MCP list diagnostic: '+json.dumps({'status':status,'error':listed.get('error'),'resultKeys':list(listed.get('result',{})),'toolCount':len(listed.get('result',{}).get('tools',[]))}),flush=True)
check(status==200 and len(listed.get('result',{}).get('tools',[]))==181,'authenticated discovery returns all 181 tools')
status,result,_=req('/api/mcp',{'jsonrpc':'2.0','id':2,'method':'tools/call','params':{'name':'getWorkOrders','arguments':{'query':{'filters':{'LastUpdatedAtFrom':'2026-11-14T00:00:00Z'},'page':{'size':1,'number':1}}}}},token)
check(status==200 and not result.get('result',{}).get('isError',True),'live work-order retrieval through MCP')
if os.environ.get('RUN_APPFOLIO_MUTATION_TESTS')=='1':
 name='MCP verification '+secrets.token_hex(6)
 key=secrets.token_hex(16)
 arguments={'body':{'Name':name,'Description':'Disposable record created by MCP acceptance verification'},'idempotencyKey':key}
 def tool(name,args,id):
  status,value,_=req('/api/mcp',{'jsonrpc':'2.0','id':id,'method':'tools/call','params':{'name':name,'arguments':args}},token)
  payload=value.get('result',{})
  if status!=200 or payload.get('isError',True):
   raise RuntimeError('Live mutation failed; status='+str(status)+'; tool='+name)
  return payload['structuredContent']
 created=tool('createInventoryLocation',arguments,10)
 record_id=created['data']['Id']
 state.write_text(json.dumps({'tokens':tokens,'clientId':client_id,'connectionId':connection,'testInventoryLocationId':record_id}));state.chmod(0o600)
 repeated=tool('createInventoryLocation',arguments,11)
 check(repeated['data']['Id']==record_id,'live idempotent create returns the same test record')
 check(repeated['metadata'].get('idempotentReplayed') is True,'live replay marker is preserved for the agent')
 tool('updateInventoryLocation',{'path':{'Id':record_id},'body':{'Description':'MCP acceptance verified; disposable test record'},'idempotencyKey':secrets.token_hex(16)},12)
 found=tool('getInventoryLocations',{'query':{'filters':{'Id':record_id}}},13)
 check(any(row.get('Id')==record_id and row.get('Description')=='MCP acceptance verified; disposable test record' for row in found['data']['data']),'live update and read verify the created test record')
 print('Test inventory location retained for inspection; no delete operation exists in the contract.',flush=True)
status,renewed,_=req('/api/auth/oauth2/token',{'grant_type':'refresh_token','client_id':client_id,'refresh_token':tokens['refresh_token'],'resource':base+'/api/mcp'},form=True)
check(status==200 and 'access_token' in renewed,'refresh rotates tokens automatically')
status,account,_=req('/api/account');grant=account['grants'][0]['id']
status,_,_=req('/api/account',{'action':'revoke','id':grant})
check(status==200,'remove authorization')
status,_,_=req('/api/mcp',{'jsonrpc':'2.0','id':3,'method':'tools/list'},token)
check(status==401,'existing access token rejected after removal')
status,_,_=req('/api/auth/oauth2/token',{'grant_type':'refresh_token','client_id':client_id,'refresh_token':renewed['refresh_token'],'resource':base+'/api/mcp'},form=True)
check(status!=200,'refresh rejected after removal')
status,_,_=req('/api/account',{'action':'delete','id':connection})
check(status==200,'delete connection and encrypted credentials')
status,_,_=req('/api/account',{'action':'password','currentPassword':password,'newPassword':password+'new','confirmation':password+'wrong'})
check(status==400,'password confirmation checked server-side')
status,_,_=req('/api/account',{'action':'password','currentPassword':password,'newPassword':password+'new','confirmation':password+'new'})
check(status==200,'password change succeeds')
print('All real-server checks passed. AppFolio mutations ran only when explicitly enabled against the designated test connection.')
