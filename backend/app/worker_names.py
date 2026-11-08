"""User-selected display names; task and agent identities stay unchanged."""
import unicodedata
from fastapi import HTTPException


def clean_worker_name(value):
    if not isinstance(value,str):
        raise HTTPException(422,'Worker names must be text.')
    name=unicodedata.normalize('NFKC',value).strip()
    if not name or len(name)>60 or any(unicodedata.category(char).startswith('C') for char in name):
        raise HTTPException(422,'Use 1–60 visible characters for each worker name.')
    return name


def choose_worker_names(agent_ids,suggested,overrides=None):
    overrides=overrides or {}
    if set(overrides)-set(agent_ids):
        raise HTTPException(422,'Names must refer to workers in this mission plan.')
    names={agent_id:clean_worker_name(overrides.get(agent_id,name)) for agent_id,name in zip(agent_ids,suggested,strict=True)}
    if len({name.casefold() for name in names.values()})!=len(names):
        raise HTTPException(422,'Give each worker a different name.')
    return names


def rename_report(report,names):
    old_to_new={row['name']:names[row['agent_id']] for row in report['assignments']}
    return {**report,'assignments':[{**row,'name':names[row['agent_id']],
        'waits_for':[old_to_new.get(name,name) for name in row['waits_for']],
        'sends_to':[old_to_new.get(name,name) for name in row['sends_to']]} for row in report['assignments']]}
