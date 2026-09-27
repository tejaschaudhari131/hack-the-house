"""Compare the frozen 527d963 parcel release with the current city source partitions."""
import json
from collections import Counter
from pathlib import Path
from data_io import parcel_features

ROOT=Path(__file__).resolve().parents[1]
def audit():
    original=json.loads((ROOT/'web/testdata/study/parcels.geojson').read_text())['features']
    baseline={f['properties']['pin']:f for f in original}
    seen=set(); neighborhoods=Counter(); inputs=Counter(); factors=Counter(); scores=Counter(); reassignments=[]; examples={}; exact=0; changed=0; count=0; internal=0; replacements={}
    derived={'scores','factors','confidence','confidence_label','confidence_notes'}
    for f in parcel_features():
        p=f['properties']; pin=p['pin']; count+=1; internal+=bool(p.get('internal_map_id'));
        if p.get('internal_map_id') and f['geometry']==baseline.get('COMMON GROUND',{}).get('geometry'):
            replacements['COMMON GROUND']=pin
        neighborhoods[p['neighborhood']]+=1
        if pin not in baseline: continue
        seen.add(pin); old=baseline[pin]['properties']
        if p['neighborhood']!=old['neighborhood']: reassignments.append({'pin':pin,'before':old['neighborhood'],'after':p['neighborhood']})
        for k in set(old)|set(p):
            if k not in derived and old.get(k)!=p.get(k): inputs[k]+=1
        for k in set(old['factors'])|set(p['factors']):
            if old['factors'].get(k)!=p['factors'].get(k): factors[k]+=1
        if p['scores']==old['scores']: exact+=1
        else:
            changed+=1
            for t,vals in old['scores'].items():
                for k,v in vals.items():
                    if p['scores'][t].get(k)!=v:scores[k]+=1
        if pin in ['0056F00338000000','0049N00010000000']: examples[pin]={'same_scores':p['scores']==old['scores'],'before':old['scores'],'after':p['scores']}
    return {'parcel_count':count,'neighborhood_count':len(neighborhoods),'internal_map_id_count':internal,'placeholder_replacements':replacements,'per_neighborhood':dict(sorted(neighborhoods.items())), 'baseline_commit':'527d963 (parcel scores unchanged by 9cf9ce1)', 'baseline_count':len(baseline),'baseline_retained':len(seen),'identical_scores':exact,'changed_scores':changed,'missing_baseline_pins':sorted(set(baseline)-seen),'reassigned_baseline_pins':reassignments,'changed_input_counts':dict(inputs),'changed_factor_counts':dict(factors),'changed_type_factor_counts':dict(scores),'examples':examples}
if __name__=='__main__': print(json.dumps(audit(),indent=2))
