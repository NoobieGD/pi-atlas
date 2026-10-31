"""Download every Pi Atlas match as NDJSON using bounded response pages."""
import argparse,json,sys,time
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError,URLError

def request(base,path,payload=None):
    body=None if payload is None else json.dumps(payload).encode()
    for attempt in range(6):
        try:
            req=Request(base+'/api/'+path,data=body,headers={} if body is None else {'Content-Type':'application/json'})
            with urlopen(req,timeout=30) as response:return json.load(response)
        except HTTPError as error:
            if error.code not in (429,502,503,504) or attempt==5:
                raise RuntimeError(f'HTTP {error.code}: '+error.read(4096).decode(errors='replace')) from error
            time.sleep(min(60,max(1,int(error.headers.get('Retry-After','5')))))
        except (URLError,TimeoutError):
            if attempt==5:raise
            time.sleep(min(30,2**attempt))

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--api',required=True);parser.add_argument('--query',default='');parser.add_argument('--output',required=True)
    parser.add_argument('--mode',choices=('digits','text','colors','shape'),default='digits');parser.add_argument('--scheme',choices=('mod26','a1z26','ascii'),default='mod26')
    parser.add_argument('--alignment',type=int,default=0);parser.add_argument('--rule',choices=('threshold','parity'),default='threshold')
    parser.add_argument('--rows',help='Pixel rows separated by /');parser.add_argument('--width',type=int,default=200)
    parser.add_argument('--sweep',action='store_true');parser.add_argument('--min-width',type=int,default=6);parser.add_argument('--max-width',type=int,default=64)
    parser.add_argument('--cursor',type=int,default=0);parser.add_argument('--after-width',type=int,default=-1)
    parser.add_argument('--search-digits',type=int);parser.add_argument('--page-size',type=int)
    args=parser.parse_args();base=args.api.rstrip('/');output=Path(args.output);sidecar=output.with_name(output.name+'.meta.json')
    if output.exists() or sidecar.exists():parser.error('Output or metadata already exists; choose a new output filename')
    p={'mode':args.mode,'query':args.query,'scheme':args.scheme,'alignment':args.alignment,'rule':args.rule,'cursor':args.cursor,'afterWidth':args.after_width,'allResults':True}
    if args.search_digits is not None:p['searchDigits']=args.search_digits
    if args.page_size is not None:p['pageSize']=args.page_size
    if args.mode=='shape':
        if not args.rows:parser.error('--rows is required for a shape')
        p.update(rows=args.rows.split('/'),width=args.width,sweep=args.sweep,minWidth=args.min_width,maxWidth=args.max_width)
    job_id=None;meta={'complete':False,'collectedCount':0,'query':p,'nextCursor':args.cursor,'nextAfterWidth':args.after_width}
    try:
        with output.open('x',encoding='utf-8') as stream:
            job_id=request(base,'search',p)['id'];page=-1
            while True:
                job=request(base,'job/'+job_id)
                if job['status'] in ('error','cancelled'):raise RuntimeError(job.get('error') or job.get('message') or job['status'])
                if job['status']!='done' or job['page']==page:time.sleep(.5);continue
                if job['page']!=page+1:raise RuntimeError('Unexpected page number; refusing to skip results')
                for hit in job.get('matches',[]):stream.write(json.dumps(hit,separators=(',',':'))+'\n')
                stream.flush();page=job['page'];meta.update(complete=job['complete'],collectedCount=meta['collectedCount']+len(job.get('matches',[])),nextCursor=job.get('nextCursor'),nextAfterWidth=job.get('nextAfterWidth',-1),datasetId=job.get('datasetId'),searchRevision=job.get('searchRevision'))
                sidecar.write_text(json.dumps(meta,indent=2),encoding='utf-8')
                print(f"{meta['collectedCount']:,} matches saved; complete={meta['complete']}",file=sys.stderr)
                if job['complete']:break
                request(base,'job/'+job_id+'/continue',{'page':page})
    finally:
        if job_id and not meta['complete']:
            try:request(base,'search/cancel',{'id':job_id})
            except Exception:pass
        sidecar.write_text(json.dumps(meta,indent=2),encoding='utf-8')

if __name__=='__main__':
    try:main()
    except KeyboardInterrupt:raise SystemExit('Interrupted; collected results are retained, complete=false.')
    except (OSError,ValueError,RuntimeError) as error:raise SystemExit(str(error))
