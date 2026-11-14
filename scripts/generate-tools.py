#!/usr/bin/env python3
"""Generate the complete, bounded MCP contract. Source OpenAPI is never changed."""
import copy, hashlib, json, pathlib, sys
root = pathlib.Path(__file__).resolve().parent.parent
raw = (root / 'database-api-openapi.json').read_bytes()
spec = json.loads(raw)

def convert(value):
    if isinstance(value, list): return [convert(v) for v in value]
    if not isinstance(value, dict): return value
    result = {k: convert(v) for k, v in value.items() if k not in ('nullable', 'example', 'xml', 'discriminator')}
    if 'next_page_path' in result.get('properties', {}):
        result['properties']['next_page_path'] = {'anyOf':[result['properties']['next_page_path'], {'type':'null'}]}
    if result.get('format') == 'uuid' and 'separated by commas' in result.get('description',''):
        result.pop('format')
        result['pattern'] = r'^[a-fA-F0-9-]+(?:,[a-fA-F0-9-]+)*$'
    if '$ref' in result:
        result['$ref'] = result['$ref'].replace('#/components/schemas/', '#/$defs/')
    if 'properties' in result: result.setdefault('type', 'object')
    if result.get('format') in ('binary', 'byte'): result.pop('format')
    if value.get('nullable'): result = {'anyOf': [result, {'type': 'null'}]}
    return result

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

upload = {'type':'object', 'additionalProperties': False, 'required':['filename','mediaType','base64'], 'properties': {
    'filename':{'type':'string','minLength':1,'maxLength':200,'pattern':r'^[^\r\n/\\\x00"]+$'},
    'mediaType':{'type':'string','pattern':r'^[a-zA-Z0-9.+-]+/[a-zA-Z0-9.+-]+$'},
    'base64':{'type':'string','maxLength':2796204,'pattern':r'^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$'}}}
operations=[]
for path, item in spec['paths'].items():
    for method, op in item.items():
        properties={}; required=[]; parameters=op.get('parameters',[])
        for location in ('path','query','header'):
            params=[p for p in parameters if p['in']==location and p['name'].lower() not in ('authorization','x-appfolio-developer-id','x-appfolio-database-id','idempotency-key')]
            if not params: continue
            group={'type':'object','additionalProperties':False,'properties':{p['name']:convert(p['schema']) for p in params}}
            req=[p['name'] for p in params if p.get('required')]
            if req: group['required']=req;required.append(location)
            properties[location]=group
        if 'page' in properties.get('query',{}).get('properties',{}):
            properties['query']['properties']['page']={'type':'object','additionalProperties':False,'properties':{'number':{'type':'integer','minimum':1},'size':{'type':'integer','minimum':1,'maximum':1000}}}
        content=op.get('requestBody',{}).get('content',{})
        media=next(iter(content),'')
        if content:
            body=convert(content[media].get('schema',{}))
            if media=='multipart/form-data':
                for name in body.get('properties',{}):
                    if name.lower()=='file' or body['properties'][name].get('format')=='binary':
                        body['properties'][name]=copy.deepcopy(upload)
                        body.setdefault('required',[]).append(name)
            if op['operationId']=='createWorkOrder':
                body['oneOf']=[{'allOf':[branch], 'required':[branch['$ref'].split('.')[-1]]} for branch in body['oneOf']]
            properties['body']=body
            if op['requestBody'].get('required'): required.append('body')
        if method in ('post','patch','put'): properties['idempotencyKey']={'type':'string','pattern':'^[A-Za-z0-9._:-]{1,128}$'}
        schema={'type':'object','additionalProperties':False,'properties':properties,'required':required}
        if op['operationId']=='getWorkOrders':
            if 'query' not in required: required.append('query')
            q=properties['query'];q['required']=['filters'];q['properties']['filters']['anyOf']=[{'required':['Id']},{'required':['LastUpdatedAtFrom']}]
        responses={status: closed(convert(r.get('content',{}).get('application/json',{}).get('schema',{}))) for status,r in op['responses'].items()}
        desc=op.get('summary','')+'\n'+op.get('description','')
        if op.get('deprecated'): desc='DEPRECATED. '+desc
        operations.append({'name':op['operationId'],'method':method.upper(),'path':path,'description':desc,'deprecated':op.get('deprecated',False),'parameters':parameters,'mediaType':media,'inputSchema':closed(schema),'responses':responses})
result={'sourceHash':hashlib.sha256(raw).hexdigest(),'operations':operations}
output=root/'src/appfolio/catalog.json'
text=json.dumps(result,indent=2,ensure_ascii=False)+'\n'
if '--check' in sys.argv:
    if not output.exists() or output.read_text()!=text: sys.exit('Tool catalog is stale. Run python3 scripts/generate-tools.py')
else: output.write_text(text)
print(f'{len(operations)} operations; catalog {len(text)} bytes')

coverage = '# Operation coverage mapping\n\nGenerated from the unchanged OpenAPI contract. All rows map to the same named tool in\n`src/appfolio/catalog.json`, with operation-specific input and HTTP response schemas.\n`contract.test.ts` constructs every request; `lifecycle.test.ts` executes success/error\nfixtures through grant binding, authentication, serialization and response validation.\nLive evidence is separate in `verification.md`. This table does not claim live coverage.\n\n| Tool | Method | Path | Response statuses |\n| --- | --- | --- | --- |\n'
for op in operations:
    coverage += f"| `{op['name']}` | {op['method']} | `{op['path']}` | {', '.join(op['responses'])} |\n"
coverage_path=root/'docs/operation-coverage.md'
if '--check' in sys.argv:
    if not coverage_path.exists() or coverage_path.read_text()!=coverage: sys.exit('Coverage mapping is stale')
else: coverage_path.write_text(coverage)
