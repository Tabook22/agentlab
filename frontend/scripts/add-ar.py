import sys,json
from pathlib import Path
sys.stdin.reconfigure(encoding='utf-8')
p=Path('src/locales/ar.json');raw=p.read_text(encoding='utf-8-sig') if p.exists() else '';data=json.loads(raw or '{}')
for line in sys.stdin.read().splitlines():
 if '|||' in line:
  key,value=line.split('|||',1);data[key]=value
p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(len(data))
