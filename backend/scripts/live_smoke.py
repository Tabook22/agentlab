"""Explicit, opt-in paid smoke test against the running loopback application."""
import argparse
import time
import json
import httpx

parser=argparse.ArgumentParser()
parser.add_argument('--prompt',default='Explain how DNS works for first-year students in a short, clear answer. Use the smallest useful team.')
parser.add_argument('--budget',type=float,default=.05)
args=parser.parse_args()
with httpx.Client(base_url='http://127.0.0.1:8000',timeout=12,trust_env=False) as client:
    response=client.post('/api/missions',json={'prompt':args.prompt,'mode':'live','max_workers':6,'max_iterations':2,'budget_usd':args.budget})
    response.raise_for_status()
    key=response.json()['id']
    print(json.dumps({'mission_id':key,'mode':'live','estimated_budget_guard_usd':args.budget}),flush=True)
    deadline=time.monotonic()+260
    while time.monotonic()<deadline:
        mission=client.get(f'/api/missions/{key}').json()
        if mission['status'] in ('COMPLETED','FAILED','CANCELLED','AWAITING_APPROVAL'):
            events=client.get(f'/api/missions/{key}/events').json()
            print(json.dumps({'status':mission['status'],'workers':[{'name':a['config']['name'],'role':a['config']['role']} for a in mission['agents']],
                'cycles':[{'agent_id':e['agent_id'],'cycle':e['payload']['cycle'],'passed':e['payload']['passed']} for e in events if e['type']=='agent.test'],
                'approval_report':next((e['payload'] for e in reversed(events) if e['type']=='mission.plan_approval_requested'),None),
                'output_label':mission['output'].get('label'),'error':mission['output'].get('error'),'usage':mission['output'].get('usage'),
                'output_preview':mission['output'].get('content','')[:400]},ensure_ascii=False),flush=True)
            break
        time.sleep(1)
    else:
        client.post(f'/api/missions/{key}/cancel')
        raise SystemExit('Smoke-test wait expired; cancellation requested.')
