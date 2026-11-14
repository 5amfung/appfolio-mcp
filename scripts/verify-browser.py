#!/usr/bin/env python3
"""Browser acceptance against an isolated application database; no AppFolio calls."""
import asyncio,os,secrets,hashlib,base64,urllib.parse
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  page=await browser.new_page(viewport={'width':1280,'height':1000})
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto(os.environ.get('BASE_URL','http://localhost:3002'))
  await page.get_by_role('button',name='Create an account',exact=True).click()
  email='browser-'+secrets.token_hex(5)+'@example.com';password=secrets.token_urlsafe(24)
  await page.get_by_label('Your name').fill('Browser verification')
  await page.get_by_label('Email',exact=True).fill(email)
  await page.get_by_label('Password',exact=True).fill(password)
  await page.get_by_role('button',name='Create account',exact=True).click()
  await page.get_by_role('heading',name='AppFolio connections').wait_for(timeout=30000)
  print('PASS browser signup and protected settings render',flush=True)
  await page.get_by_label('Current password',exact=True).fill(password)
  await page.get_by_label('New password',exact=True).fill(password+'new')
  await page.get_by_label('Confirm new password',exact=True).fill(password+'mismatch')
  valid=await page.get_by_label('Confirm new password',exact=True).evaluate('(input)=>input.validity.valid')
  assert not valid,'Password mismatch must have immediate client feedback'
  await page.get_by_label('Confirm new password',exact=True).fill(password+'new')
  await page.get_by_role('button',name='Change password',exact=True).click()
  await page.get_by_role('status').filter(has_text='Password changed').wait_for(timeout=30000)
  assert await page.get_by_label('Current password',exact=True).input_value()==''
  assert await page.get_by_label('New password',exact=True).input_value()==''
  print('PASS password mismatch feedback, change and field clearing',flush=True)
  await page.screenshot(path='/tmp/appfolio-mcp-settings.png',full_page=True)
  await page.get_by_role('button',name='Sign out',exact=True).click()
  await page.get_by_role('heading',name='Sign in',exact=True).wait_for(timeout=30000)
  await page.get_by_label('Email',exact=True).fill(email)
  await page.get_by_label('Password',exact=True).fill(password+'new')
  await page.get_by_role('button',name='Sign in',exact=True).click()
  await page.get_by_role('heading',name='AppFolio connections').wait_for(timeout=30000)
  assert not errors,'Unexpected browser runtime error'
  print('PASS signout, signin with changed password, no browser runtime errors',flush=True)
  base=os.environ.get('BASE_URL','http://localhost:3002')
  registration=await page.request.post(base+'/api/auth/oauth2/register',headers={'Origin':base},data={'client_name':'Browser verification agent','application_type':'native','redirect_uris':['http://127.0.0.1:38219/callback'],'token_endpoint_auth_method':'none','grant_types':['authorization_code','refresh_token'],'response_types':['code'],'scope':'mcp:tools offline_access'})
  client=await registration.json()
  verifier=secrets.token_urlsafe(48)
  challenge=base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
  state=secrets.token_hex(12)
  params={'client_id':client['client_id'],'redirect_uri':'http://127.0.0.1:38219/callback','response_type':'code','code_challenge':challenge,'code_challenge_method':'S256','state':state,'scope':'mcp:tools offline_access','resource':base+'/api/mcp'}
  guest=await browser.new_page(viewport={'width':1280,'height':1000})
  await guest.route('http://127.0.0.1:38219/callback**',lambda route:route.fulfill(status=200,body='Authorization callback received'))
  await guest.goto(base+'/api/auth/oauth2/authorize?'+urllib.parse.urlencode(params))
  await guest.get_by_label('Email',exact=True).fill(email)
  await guest.get_by_label('Password',exact=True).fill(password+'new')
  await guest.get_by_role('button',name='Sign in',exact=True).click()
  await guest.wait_for_url('**/select-connection?**',timeout=30000)
  await guest.get_by_label('Connection name',exact=True).fill('Browser connection')
  for label,key in [('AppFolio client ID','APPFOLIO_TEST_CLIENT_ID'),('AppFolio client secret','APPFOLIO_TEST_CLIENT_SECRET'),('AppFolio database ID','APPFOLIO_TEST_DATABASE_ID'),('AppFolio developer ID','APPFOLIO_TEST_DEVELOPER_ID')]:
   await guest.get_by_label(label,exact=True).fill(os.environ[key])
  await guest.get_by_role('button',name='Save connection',exact=True).click()
  await guest.get_by_role('radio').first.check(timeout=30000)
  await guest.get_by_role('button',name='Continue to consent',exact=True).click()
  await guest.wait_for_url('**/consent?**',timeout=30000)
  await guest.get_by_role('button',name='Allow access',exact=True).click()
  await guest.wait_for_url('http://127.0.0.1:38219/callback**',timeout=30000)
  callback=urllib.parse.parse_qs(urllib.parse.urlsplit(guest.url).query)
  assert callback['state']==[state] and 'code'in callback
  print('PASS browser OAuth login, connection creation, selection, consent and callback',flush=True)
  await browser.close()
asyncio.run(main())
