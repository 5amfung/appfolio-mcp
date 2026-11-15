#!/usr/bin/env python3
"""Check public preview discovery, application auth, and the production pause without cookies."""
import json
import os
import urllib.error
import urllib.parse
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


opener = urllib.request.build_opener(NoRedirect())
base = os.environ.get('BASE_URL', '').rstrip('/')


def request(url):
    try:
        response = opener.open(url, timeout=45)
    except urllib.error.HTTPError as error:
        response = error
    return response.status, response.headers, response.read()


def check(condition, label):
    if not condition:
        raise RuntimeError(label)
    print('PASS ' + label, flush=True)


def main():
    check(bool(base), 'BASE_URL specifies the exact preview deployment origin')
    status, headers, _ = request(base + '/ping')
    check(status == 200 and 'no-store' in headers.get('Cache-Control', ''),
          'preview health is public and uncached')
    status, _, _ = request(base + '/sign-in')
    check(status == 200, 'application sign-in is reachable without a Vercel cookie')

    resource = base + '/api/mcp'
    status, headers, _ = request(resource)
    metadata_url = base + '/.well-known/oauth-protected-resource/api/mcp'
    challenge = headers.get('WWW-Authenticate', '')
    check(status == 401 and f'resource_metadata="{metadata_url}"' in challenge
          and 'scope="mcp:tools offline_access"' in challenge,
          'application OAuth advertises default tool and renewal scopes')
    status, _, _ = request(base + '/api/account')
    check(status == 401, 'account data requires an application session')

    status, _, body = request(metadata_url)
    check(status == 200, 'protected-resource metadata is public')
    metadata = json.loads(body)
    issuer = base + '/api/auth'
    check(metadata.get('resource') == resource and metadata.get('authorization_servers') == [issuer],
          'discovery identifies the preview resource and authorization server')
    # RFC 8414 inserts the well-known segment before the issuer path.
    issuer_path = urllib.parse.urlsplit(issuer).path
    status, _, body = request(base + '/.well-known/oauth-authorization-server' + issuer_path)
    check(status == 200, 'authorization-server metadata is public')
    metadata = json.loads(body)
    check(metadata.get('issuer') == issuer
          and {'mcp:tools', 'offline_access'} <= set(metadata.get('scopes_supported', []))
          and 'S256' in metadata.get('code_challenge_methods_supported', [])
          and {'authorization_code', 'refresh_token'} <= set(metadata.get('grant_types_supported', [])),
          'OAuth advertises PKCE, tool access and refresh support')
    for key, path in [('registration_endpoint', '/oauth2/register'),
                      ('authorization_endpoint', '/oauth2/authorize'),
                      ('token_endpoint', '/oauth2/token')]:
        check(metadata.get(key) == issuer + path, key + ' stays on the preview origin')

    if os.environ.get('EXPECT_PRODUCTION_UNPUBLISHED') == '1':
        for url in ['https://appfolio-mcp-zeta.vercel.app',
                    'https://appfolio-mcp-doughyrematch.vercel.app']:
            status, headers, _ = request(url + '/ping')
            check(status in (404, 503) and headers.get('x-vercel-error') in
                  ('DEPLOYMENT_PAUSED', 'DEPLOYMENT_NOT_FOUND', 'NOT_FOUND'),
                  urllib.parse.urlsplit(url).hostname + ' has no published production app')


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, ValueError, urllib.error.URLError) as error:
        print('FAIL public preview verification: ' +
              (str(error) if isinstance(error, RuntimeError) else type(error).__name__))
        raise SystemExit(1)
