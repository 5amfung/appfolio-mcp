#!/usr/bin/env python3
"""Generate the complete, bounded MCP contract. Source OpenAPI is never changed."""
import copy, hashlib, html, json, pathlib, re, subprocess, sys
root = pathlib.Path(__file__).resolve().parent.parent
raw = (root / 'database-api-openapi.json').read_bytes()
spec = json.loads(raw)

def prose(text):
    text = re.sub(r'<br\s*/?>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'</?(?:details|summary|b|strong|p|div|span)\b[^>]*>', '', text, flags=re.IGNORECASE)
    return html.unescape(text).strip()

def describe(schema, text):
    existing = schema.get('description', '')
    schema['description'] = '\n\n'.join(dict.fromkeys(prose(v) for v in (text, existing) if v.strip()))
    return schema

def examples(schema, source):
    values = list(schema.get('examples', []))
    if 'example' in source: values.append(source['example'])
    if isinstance(source.get('examples'), dict):
        values.extend(v['value'] for v in source['examples'].values() if 'value' in v)
    if values:
        schema['examples'] = list({json.dumps(v, sort_keys=True): v for v in values}.values())
    return schema

def convert(value):
    if isinstance(value, list): return [convert(v) for v in value]
    if not isinstance(value, dict): return value
    result = {k: convert(v) for k, v in value.items() if k not in ('nullable', 'example', 'xml', 'discriminator')}
    if isinstance(result.get('description'), str): result['description'] = prose(result['description'])
    if 'example' in value: result['examples'] = [copy.deepcopy(value['example'])]
    if 'next_page_path' in result.get('properties', {}):
        result['properties']['next_page_path'] = {'anyOf':[result['properties']['next_page_path'], {'type':'null'}]}
    if result.get('format') == 'uuid' and 'separated by commas' in result.get('description',''):
        result.pop('format')
        result['pattern'] = r'^[a-fA-F0-9-]+(?:,[a-fA-F0-9-]+)*$'
    if '$ref' in result:
        result['$ref'] = result['$ref'].replace('#/components/schemas/', '#/$defs/')
    if 'properties' in result: result.setdefault('type', 'object')
    if result.get('format') in ('binary', 'byte'): result.pop('format')
    if value.get('nullable'):
        metadata = {k: result[k] for k in ('description', 'title', 'examples', 'default', 'deprecated') if k in result}
        result = {'anyOf': [result, {'type': 'null'}], **metadata}
    return result

def documented(schema):
    """Expose common object fields in compositions without removing constraints."""
    defs = schema.get('$defs', {})
    annotations = ('description', 'title', 'examples', 'default', 'deprecated')
    structural = set(annotations) | {'type', 'properties', 'required'}

    def visit(node, seen=()):
        node = copy.deepcopy(node)
        ref = node.get('$ref', '')
        if ref.startswith('#/$defs/'):
            key = ref.split('/')[-1]
            target = defs[key]
            for k in annotations:
                if k in target and k not in node: node[k] = copy.deepcopy(target[k])
        for key in ('properties', '$defs'):
            if key in node: node[key] = {k: visit(v, seen) for k, v in node[key].items()}
        if isinstance(node.get('items'), dict): node['items'] = visit(node['items'], seen)
        for key in ('allOf', 'anyOf', 'oneOf'):
            if key in node: node[key] = [visit(v, seen) for v in node[key]]

        parts = []
        for part in node.get('allOf', []):
            if '$ref' in part:
                name = part['$ref'].split('/')[-1]
                if name in seen: break
                part = visit(defs[name], (*seen, name))
            if part.get('type') != 'object' or not set(part) <= structural: break
            parts.append(part)
        else:
            if parts:
                # These parts contain only object properties/required and annotations.
                # Intersect overlapping properties rather than choosing one schema.
                props = {}
                required = []
                for part in [*parts, node]:
                    for name, value in part.get('properties', {}).items():
                        if name in props and props[name] != value:
                            props[name] = describe({'allOf': [props[name], value]}, value.get('description', props[name].get('description', '')))
                        else: props[name] = value
                    required.extend(part.get('required', []))
                node.pop('allOf')
                node['type'] = 'object'
                node['properties'] = props
                if required: node['required'] = list(dict.fromkeys(required))

        for kind in ('anyOf', 'oneOf'):
            for part in node.get(kind, []):
                if 'description' in node and 'description' not in part:
                    part['description'] = node['description']
                if node.get('properties'):
                    # Every alternative also obeys the parent properties/required.
                    # Repeating them keeps clients from presenting an opaque union.
                    part['type'] = 'object'
                    part['properties'] = {**copy.deepcopy(node['properties']), **part.get('properties', {})}
                    required = [*node.get('required', []), *part.get('required', [])]
                    if required: part['required'] = list(dict.fromkeys(required))
        return node

    return visit(schema)

def closed(schema):
    schema = copy.deepcopy(schema)
    defs = {}
    def visit(x):
        if isinstance(x, list):
            for v in x: visit(v)
        if not isinstance(x, dict): return
        ref = x.get('$ref', '')
        if ref.startswith('#/$defs/'):
            key = ref.split('/')[-1]
            if key not in defs:
                defs[key] = convert(spec['components']['schemas'][key])
                if key == 'InventoryLocation':
                    prop=defs[key]['properties']['PropertyId']
                    defs[key]['properties']['PropertyId']={'anyOf':[prop,{'type':'null'}]}
                visit(defs[key])
        for v in x.values(): visit(v)
    visit(schema)
    if defs: schema['$defs'] = defs
    return schema

upload_example = {'filename': 'sample.txt', 'mediaType': 'text/plain', 'base64': 'aGVsbG8='}
upload = {'type':'object', 'description':'File bytes to upload. Provide filename, MIME mediaType, and standard base64 content, not a local path, URL, or data URL. The complete encoded multipart request is limited to 2 MiB.', 'examples':[upload_example], 'additionalProperties': False, 'required':['filename','mediaType','base64'], 'properties': {
    'filename':{'type':'string','description':'Display filename with extension, without directories, quotes, or control characters. At most 200 characters.','examples':['sample.txt'],'minLength':1,'maxLength':200,'pattern':r'^[^\r\n/\\\x00"]+$'},
    'mediaType':{'type':'string','description':'MIME content type of the file bytes, such as text/plain or application/pdf.','examples':['text/plain'],'pattern':r'^[a-zA-Z0-9.+-]+/[a-zA-Z0-9.+-]+$'},
    'base64':{'type':'string','description':'Standard base64-encoded file bytes, without a data URL prefix. aGVsbG8= encodes the text hello. The complete multipart request must fit the 2 MiB limit.','examples':['aGVsbG8='],'maxLength':2796204,'pattern':r'^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$'}}}
group_help = {
    'path': 'Resource identifiers substituted into the endpoint path. Use the exact field names shown; provide IDs from records available through the selected AppFolio connection.',
    'query': 'Query parameters as nested JSON objects. For example, use filters: {Id: "..."} and page: {number: 1, size: 20}; the server performs bracketed query encoding. Do not pass a URL or pre-encoded query string.',
    'header': 'Documented operation-specific headers. Authentication and AppFolio developer/database headers are supplied by the server, not by tool arguments.',
}
operations=[]
for path, item in spec['paths'].items():
    for method, op in item.items():
        properties={}; required=[]; parameters=op.get('parameters',[])
        for location in ('path','query','header'):
            params=[p for p in parameters if p['in']==location and p['name'].lower() not in ('authorization','x-appfolio-developer-id','x-appfolio-database-id','idempotency-key')]
            if not params: continue
            group={'type':'object','description':group_help[location],'additionalProperties':False,'properties':{p['name']:examples(describe(convert(p['schema']),p.get('description','')),p) for p in params}}
            req=[p['name'] for p in params if p.get('required')]
            if req: group['required']=req;required.append(location)
            properties[location]=group
        if 'page' in properties.get('query',{}).get('properties',{}):
            old = properties['query']['properties']['page']
            defaults = old.get('default', {})
            page = {**old,'type':'object','examples':old.get('examples',[{'number':1,'size':20}]),'additionalProperties':False,'properties':{
                'number':{'type':'integer','minimum':1,'description':'One-based page number. Repeat the same filters when requesting subsequent pages. Omit to use the upstream default.','examples':[defaults.get('number',1)]},
                'size':{'type':'integer','minimum':1,'maximum':1000,'description':'Requested records per page, from 1 to 1000. AppFolio may enforce a smaller endpoint-specific limit. A call returns one page; omit to use the upstream default.','examples':[20]}}}
            for key, value in defaults.items():
                if key in page['properties']: page['properties'][key]['default'] = value
            properties['query']['properties']['page'] = describe(page,'Optional pagination. Each call retrieves one page, not every matching record. Preserve the filters while advancing page.number.')
        content=op.get('requestBody',{}).get('content',{})
        media=next(iter(content),'')
        if content:
            body=examples(describe(convert(content[media].get('schema',{})),op['requestBody'].get('description','')),content[media])
            if media=='multipart/form-data':
                for name in body.get('properties',{}):
                    if name.lower()=='file' or body['properties'][name].get('format')=='binary':
                        body['properties'][name]=copy.deepcopy(upload)
                        body.setdefault('required',[]).append(name)
                        for example in body.get('examples', []):
                            if isinstance(example,dict) and name in example: example[name]=copy.deepcopy(upload_example)
            if op['operationId']=='createWorkOrder':
                body['oneOf']=[{'allOf':[branch], 'required':[branch['$ref'].split('.')[-1]]} for branch in body['oneOf']]
            body=describe(body,'Request payload as JSON. The server handles upstream serialization.' if media!='multipart/form-data' else 'Multipart upload fields. Supply the documented File object containing bytes, not a filesystem path; the server constructs multipart form data.')
            if 'data' in body.get('properties', {}) and not body['properties']['data'].get('description'):
                body['properties']['data']['description'] = 'Records to process for '+op.get('summary',op['operationId'])+'. Each item follows the documented item schema.'
            if op['operationId']=='createInspection':
                body['properties']['inspection']['description']='Inspection to create. Supply the nested inspection object with the fields documented in this schema.'
            properties['body']=body
            if op['requestBody'].get('required'): required.append('body')
        if method in ('post','patch','put'): properties['idempotencyKey']={'type':'string','description':'Optional key identifying one logical write. Prefer supplying your own key before the first call so it remains known if the entire response is lost. Omit or pass an empty string to generate a key. Upstream-result envelopes return metadata.idempotencyKey; local tool-error JSON returns top-level idempotencyKey if a key was assigned. Reuse the known key and unchanged arguments under the same authorization within 24 hours; changed arguments are rejected. A new key can execute another write. If the outcome is unknown and no original key is available, check upstream before starting a new write. The server reuses exact request bytes, but some upstream failures permit re-execution; this is not an unconditional exactly-once guarantee. Respect metadata.retryAfter when present. At most 256 printable ASCII characters.','examples':['maintenance-request-001'],'maxLength':256,'pattern':'^[ -~]*$'}
        schema={'type':'object','additionalProperties':False,'properties':properties,'required':required}
        if op['operationId']=='getWorkOrders':
            if 'query' not in required: required.append('query')
            q=properties['query'];q['required']=['filters'];q['properties']['filters']['anyOf']=[{'required':['Id']},{'required':['LastUpdatedAtFrom']}]
            schema['examples']=[{'query':{'filters':{'LastUpdatedAtFrom':'2026-01-01T00:00:00Z'},'page':{'number':1,'size':20}}}]
        if op['operationId']=='createWorkOrder':
            properties['body'].setdefault('examples',[]).append({'JobDescription':'Repair the leaking kitchen faucet.','PropertyId':'11111111-1111-4111-8111-111111111111','Priority':'Normal'})
        responses={status: closed(convert(r.get('content',{}).get('application/json',{}).get('schema',{}))) for status,r in op['responses'].items()}
        if method in ('post','patch','put'):
            for status in ('400','409','422'):
                responses.setdefault(status,{'type':'object','properties':{'code':{'type':'integer'},'message':{'type':'string'}},'required':['code','message']})
        desc=prose(op.get('summary','')+'\n'+op.get('description',''))
        if properties:
            desc+='\n\nArguments use named JSON groups: '+', '.join(k for k in properties if k!='idempotencyKey')+'. Field descriptions, formats, allowed values, defaults, and examples are included in the input schema. Record IDs in examples are illustrative; use records from the authorized connection.'
        desc+='\n\nWhen an upstream response is available, returns an envelope with status (upstream HTTP status), data (operation result or error), and metadata (correlation, retry guidance, and write replay identity). Local validation, authorization, or transport errors set isError and return text containing JSON with error, status, correlationId, and idempotencyKey or upstreamStatus when available. Preserve that top-level error idempotencyKey for retries. A successful MCP transport alone does not establish that the AppFolio operation succeeded; inspect isError, status, and any per-record results.'
        if method=='patch':
            desc+='\n\nSupply the fields intended for this update. Follow each field\'s documented null, empty, and omission behavior; do not treat those values as interchangeable ways to clear a field.'
        if '202' in responses:
            desc+='\n\nHTTP 202 means accepted, not completed. Keep the returned JobId and inspect the documented asynchronous result before treating the write as finished.'
        if op['operationId']=='getjobs':
            desc+='\n\nThis service accepts only JobIds recorded under the same authorization. Preserve the original authorization when polling. Requests are additionally limited to one poll per connection every 3.1 seconds, and recorded jobs expire after seven days.'
        if op['operationId']=='getWorkOrders':
            desc+='\n\nSupply query.filters.Id or query.filters.LastUpdatedAtFrom, or both. Use WorkOrderStatus rather than deprecated Status; the two status filters are mutually exclusive. Example arguments: '+json.dumps({'query':{'filters':{'LastUpdatedAtFrom':'2026-01-01T00:00:00Z'},'page':{'number':1,'size':20}}})
        if op.get('deprecated'): desc='DEPRECATED. '+desc
        operations.append({'name':op['operationId'],'method':method.upper(),'path':path,'description':desc,'deprecated':op.get('deprecated',False),'parameters':parameters,'mediaType':media,'inputSchema':documented(closed(schema)),'responses':responses})
result={'sourceHash':hashlib.sha256(raw).hexdigest(),'operations':operations}
validated = subprocess.run(
    ['node', '--import', 'tsx', str(root/'scripts/document-tool-examples.ts')],
    input=json.dumps(result), text=True, capture_output=True, cwd=root, check=True,
)
result=json.loads(validated.stdout)
output=root/'src/appfolio/catalog.json'
text=json.dumps(result,indent=2,ensure_ascii=False)+'\n'
if '--check' in sys.argv:
    if not output.exists() or output.read_text()!=text: sys.exit('Tool catalog is stale. Run python3 scripts/generate-tools.py')
else: output.write_text(text)
print(f'{len(operations)} operations; catalog {len(text)} bytes')
print(f"{len(result['omittedDocumentationExamples'])} incompatible upstream documentation examples omitted; see catalog audit entries")

coverage = '# Operation coverage mapping\n\nGenerated from the unchanged OpenAPI contract. All rows map to the same named tool in\n`src/appfolio/catalog.json`, with operation-specific input and HTTP response schemas.\n`contract.test.ts` constructs every request; `lifecycle.test.ts` executes success/error\nfixtures through grant binding, authentication, serialization and response validation.\nLive evidence is separate in `verification.md`. This table does not claim live coverage.\n\n| Tool | Method | Path | Response statuses |\n| --- | --- | --- | --- |\n'
for op in operations:
    coverage += f"| `{op['name']}` | {op['method']} | `{op['path']}` | {', '.join(op['responses'])} |\n"
coverage_path=root/'docs/operation-coverage.md'
if '--check' in sys.argv:
    if not coverage_path.exists() or coverage_path.read_text()!=coverage: sys.exit('Coverage mapping is stale')
else: coverage_path.write_text(coverage)
