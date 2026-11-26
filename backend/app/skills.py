"""Workspace-scoped skill catalog. Published revisions are immutable run inputs."""
import re
from typing import Annotated
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select, update
import yaml
from .db import Skill, SkillVersion, uid


class SkillInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str = Field(pattern=r'^[a-zA-Z][a-zA-Z0-9_]{0,59}$')
    description: str = Field(default='', max_length=600)
    required: bool = True


class SkillBody(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=5, max_length=2000)
    instructions: str = Field(min_length=5, max_length=16000)
    inputs: list[SkillInput] = Field(default_factory=list, max_length=30)
    outputs: list[Annotated[str, Field(min_length=1, max_length=1500)]] = Field(min_length=1, max_length=20)

    @model_validator(mode='after')
    def visible(self):
        self.name = self.name.strip()
        if not self.name or not self.instructions.strip() or not all(x.strip() for x in self.outputs):
            raise ValueError('Use visible names, instructions and output descriptions.')
        if len({x.name for x in self.inputs}) != len(self.inputs):
            raise ValueError('Input names must be unique.')
        return self


class SkillEdit(SkillBody):
    expected_version: int = Field(ge=1)


class Publish(BaseModel):
    version: int = Field(ge=1)


class ImportSkill(BaseModel):
    content: str = Field(min_length=1, max_length=24000)


def revision(db, skill_id, version=None, active=False):
    skill = db.get(Skill, skill_id)
    if not skill:
        raise HTTPException(404, 'Skill not found in this workspace.')
    number = version if version is not None else skill.active_version if active else skill.latest_version
    if number is None:
        raise HTTPException(409, 'This skill has no active revision. Review and activate a draft first.')
    row = db.scalar(select(SkillVersion).where(SkillVersion.skill_id == skill_id, SkillVersion.version == number))
    if not row:
        raise HTTPException(404, 'Skill revision not found.')
    return skill, row


def snapshot(row):
    return {key: getattr(row, key) for key in ('skill_id', 'version', 'name', 'description', 'instructions', 'inputs', 'outputs')}


def public_skill(db, skill):
    _, row = revision(db, skill.id)
    active = revision(db, skill.id, skill.active_version)[1] if skill.active_version is not None else None
    return {'id': skill.id, 'active_version': skill.active_version, 'latest_version': skill.latest_version,
            'active_name': active.name if active else None, 'active_description': active.description if active else None,
            'created_at': skill.created_at, **snapshot(row), 'provenance': row.provenance,
            'status': 'active' if skill.active_version == row.version else 'draft',
            'has_active_version': skill.active_version is not None}


def create_draft(db, body, provenance=None, target=None):
    if target is None:
        skill = Skill(id=uid())
        db.add(skill); db.flush()
        number = 1
    else:
        skill = db.get(Skill, target)
        if not skill:
            raise HTTPException(404, 'Update target not found in this workspace.')
        number = skill.latest_version + 1
        changed = db.execute(update(Skill).where(Skill.id == skill.id, Skill.latest_version == number - 1)
                             .values(latest_version=number))
        if changed.rowcount != 1:
            raise HTTPException(409, 'Another draft was saved. Reload before editing.')
        skill.latest_version = number
    db.add(SkillVersion(skill_id=skill.id, version=number, **body.model_dump(), provenance=provenance or {}))
    db.commit()
    return public_skill(db, skill)


def parse_skill_md(content):
    if not content.startswith('---\n') and not content.startswith('---\r\n'):
        raise HTTPException(422, 'SKILL.md must begin with YAML front matter containing name and description.')
    parts = re.split(r'^---\s*$', content, maxsplit=2, flags=re.MULTILINE)
    if len(parts) != 3 or len(parts[1]) > 12000:
        raise HTTPException(422, 'Invalid or oversized YAML front matter.')
    try:
        if any(isinstance(token, (yaml.tokens.AliasToken, yaml.tokens.AnchorToken)) for token in yaml.scan(parts[1])):
            raise ValueError('YAML aliases are not supported.')
        depth = 0
        for index, event in enumerate(yaml.parse(parts[1])):
            if isinstance(event, (yaml.events.SequenceStartEvent, yaml.events.MappingStartEvent)): depth += 1
            if isinstance(event, (yaml.events.SequenceEndEvent, yaml.events.MappingEndEvent)): depth -= 1
            if depth > 16 or index > 1500: raise ValueError('YAML nesting is too deep.')
        meta = yaml.safe_load(parts[1])
        if not isinstance(meta, dict):
            raise ValueError('Use a YAML mapping.')
        return SkillBody(name=meta.get('name'), description=meta.get('description'), instructions=parts[2].strip(),
                         inputs=meta.get('inputs', []), outputs=meta.get('outputs', ['A result meeting the workflow instructions.']))
    except (ValueError, TypeError, RecursionError, yaml.YAMLError):
        raise HTTPException(422, 'Use valid YAML name/description, optional inputs/outputs, and a nonempty instruction body.') from None


def export_skill_md(row):
    fields = {key: getattr(row, key) for key in ('name', 'description', 'inputs', 'outputs')}
    fields['metadata'] = {'skill_id': row.skill_id, 'version': row.version}
    return '---\n' + yaml.safe_dump(fields, allow_unicode=True, sort_keys=False) + '---\n\n' + row.instructions.strip() + '\n'


def skills_router(sessions):
    router = APIRouter(prefix='/api/skills')

    @router.get('')
    def catalog():
        with sessions() as db:
            return [public_skill(db, skill) for skill in db.scalars(select(Skill).order_by(Skill.created_at.desc(), Skill.id))]

    @router.post('', status_code=201)
    def create(body: SkillBody):
        with sessions() as db:
            return create_draft(db, body)

    @router.post('/import', status_code=201)
    def import_file(body: ImportSkill):
        with sessions() as db:
            return create_draft(db, parse_skill_md(body.content), {'source': 'SKILL.md import; activation requires review'})

    @router.get('/{key}')
    def inspect(key: str):
        with sessions() as db:
            skill, _ = revision(db, key)
            return {**public_skill(db, skill), 'versions': [
                {**snapshot(row), 'created_at': row.created_at, 'provenance': row.provenance}
                for row in db.scalars(select(SkillVersion).where(SkillVersion.skill_id == key).order_by(SkillVersion.version.desc()))]}

    @router.put('/{key}')
    def edit(key: str, body: SkillEdit):
        with sessions() as db:
            skill, _ = revision(db, key)
            if skill.latest_version != body.expected_version:
                raise HTTPException(409, 'This skill changed. Reload its latest version before editing.')
            return create_draft(db, SkillBody.model_validate(body.model_dump(exclude={'expected_version'})), target=key)

    @router.post('/{key}/activate')
    def activate(key: str, body: Publish):
        with sessions() as db:
            skill, row = revision(db, key, body.version)
            if row.version != skill.latest_version:
                raise HTTPException(409, 'Review and activate the latest draft. Older revisions remain available to historical runs.')
            skill.active_version = row.version
            db.commit()
            return public_skill(db, skill)

    @router.post('/{key}/deactivate')
    def deactivate(key: str):
        with sessions() as db:
            skill, _ = revision(db, key)
            skill.active_version = None
            db.commit()
            return public_skill(db, skill)

    @router.get('/{key}/export')
    def export(key: str, version: int | None = None):
        with sessions() as db:
            _, row = revision(db, key, version)
            return Response(export_skill_md(row), media_type='text/markdown; charset=utf-8',
                            headers={'Content-Disposition': 'attachment; filename="SKILL.md"', 'Cache-Control': 'no-store'})
    return router
