"""Bounded energy-data analysis and reproducible, non-AI exports."""
import csv
import hashlib
import io
import re
from collections import defaultdict
from decimal import Decimal, InvalidOperation
from typing import Literal
from uuid import UUID
from xml.sax.saxutils import escape
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field, model_validator
from .access import require_user
from .db import StudioRun
from .studio import find_run, public_run

SAMPLE_CSV = '''building,month,kwh
Library,2026-01,1200
Library,2026-02,1000
Science,2026-01,2200
Science,2026-02,2000
Arts,2026-01,800
Arts,2026-02,900
'''


class ProjectRequest(BaseModel):
    request_id: UUID
    sample: bool = False
    filename: str = Field(default='energy.csv', min_length=1, max_length=200)
    csv_text: str | None = Field(default=None, max_length=524288)

    @model_validator(mode='after')
    def one_source(self):
        if self.sample == (self.csv_text is not None):
            raise ValueError('Choose either the sample or your CSV data.')
        return self


def number(value):
    text = format(value, 'f')
    return text.rstrip('0').rstrip('.') if '.' in text else text


def analyze_energy(text, filename, source_kind):
    if len(text.encode('utf-8')) > 524288:
        raise ValueError('CSV input exceeds 512 KB. Use a smaller dataset.')
    reader = csv.reader(io.StringIO(text.lstrip('\ufeff'), newline=''), strict=True)
    try:
        header = next(reader, None)
        if header is None or [h.strip().lower() for h in header] != ['building', 'month', 'kwh']:
            raise ValueError('Use exactly these CSV columns in order: building,month,kwh.')
        rows = []; seen = set(); grouped = defaultdict(list)
        for line, cells in enumerate(reader, start=2):
            if not cells or all(not cell.strip() for cell in cells):
                continue
            if len(rows) >= 5000:
                raise ValueError('Use at most 5,000 data rows.')
            if len(cells) != 3:
                raise ValueError(f'CSV row {line}: expected exactly three values.')
            building, month, raw = (cell.strip() for cell in cells)
            if not building or len(building) > 80 or any(ord(char) < 32 for char in building):
                raise ValueError(f'CSV row {line}: use a building name of 1–80 characters without control characters.')
            if not re.fullmatch(r'[0-9]{4}-(0[1-9]|1[0-2])', month):
                raise ValueError(f'CSV row {line}: month must use YYYY-MM, for example 2026-01.')
            try:
                value = Decimal(raw)
            except InvalidOperation:
                raise ValueError(f'CSV row {line}: kwh must be a finite non-negative number.') from None
            if not value.is_finite() or value < 0 or value > 1000000000:
                raise ValueError(f'CSV row {line}: kwh must be between 0 and 1,000,000,000.')
            # Bound precision without rounding or changing the submitted data.
            try:
                rounded = value.quantize(Decimal('.001'))
            except InvalidOperation:
                raise ValueError(f'CSV row {line}: kwh precision is unsupported.') from None
            if value != rounded:
                raise ValueError(f'CSV row {line}: kwh supports at most three decimal places.')
            value = abs(rounded) if rounded == 0 else rounded
            identity = (building.casefold(), month)
            if identity in seen:
                raise ValueError(f'CSV row {line}: duplicate building and month. Resolve the duplicate before analysis.')
            seen.add(identity)
            # Consistent names prevent accidental separate groups for Library/library.
            if any(name.casefold() == building.casefold() and name != building for name in grouped):
                raise ValueError(f'CSV row {line}: use consistent capitalization for each building.')
            grouped[building].append(value)
            if len(grouped) > 100:
                raise ValueError('Use at most 100 buildings per project.')
            rows.append({'building': building, 'month': month, 'kwh': number(value)})
    except csv.Error:
        raise ValueError('The CSV quoting is malformed. Check the file and try again.') from None
    if not rows:
        raise ValueError('Add at least one data row after the CSV header.')
    totals = [{'building': name, 'kwh': number(sum(values)), 'observations': len(values)}
              for name, values in sorted(grouped.items(), key=lambda pair: (-sum(pair[1]), pair[0]))]
    direct_total = sum(Decimal(row['kwh']) for row in rows)
    grouped_total = sum(Decimal(row['kwh']) for row in totals)
    months = sorted({row['month'] for row in rows})
    checks = [
        {'id': 'totals', 'passed': direct_total == grouped_total, 'actual': number(direct_total)},
        {'id': 'row_count', 'passed': sum(row['observations'] for row in totals) == len(rows), 'actual': len(rows)},
        {'id': 'unique', 'passed': len(seen) == len(rows), 'actual': len(seen)},
    ]
    if not all(check['passed'] for check in checks):
        raise ValueError('The independent checks did not agree. This project was not saved.')
    return {'engine': 'energy-analysis-v1', 'source_kind': source_kind,
            'filename': filename.replace('\\', '/').split('/')[-1],
            'source_sha256': hashlib.sha256(text.encode('utf-8')).hexdigest(), 'source_csv': text,
            'rows': rows, 'totals': totals, 'total_kwh': number(direct_total),
            'row_count': len(rows), 'months': months, 'building_count': len(grouped),
            'uneven_coverage': any(row['observations'] != len(months) for row in totals),
            'checks': checks,
            'trace': [{'owner': 'Input validator', 'operation': 'validate_schema_units_duplicates', 'rows': len(rows)},
                      {'owner': 'Data analyst', 'operation': 'group_and_sum_kwh', 'groups': len(grouped)},
                      {'owner': 'Verifier', 'operation': 'recompute_total_from_source_rows', 'total_kwh': number(direct_total)}],
            'limitations': ['Consumption totals are not efficiency measures.',
                            'No floor area, occupancy, tariffs or weather adjustments were supplied.',
                            'Checks verify this calculation, not the accuracy of meter readings.']}


def csv_safe(value):
    # Protect text cells when a downloaded CSV is opened in a spreadsheet.
    value = str(value)
    return "'" + value if value.lstrip().startswith(('=', '+', '-', '@')) else value


def csv_export(fields, rows):
    output = io.StringIO(newline='')
    writer = csv.writer(output)
    writer.writerow(fields)
    for row in rows:
        writer.writerow([csv_safe(row[field]) for field in fields])
    return output.getvalue().encode('utf-8-sig')


def chart_svg(data):
    height = 110 + 44 * len(data['totals'])
    maximum = max(Decimal(row['kwh']) for row in data['totals']) or Decimal(1)
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="960" height="{height}" viewBox="0 0 960 {height}" role="img" aria-labelledby="title desc">',
             '<title id="title">Recorded electricity consumption by building</title>',
             '<desc id="desc">Absolute totals in kWh; these are not efficiency scores.</desc>',
             '<rect width="100%" height="100%" fill="#ffffff"/>',
             '<g font-family="Arial,sans-serif" fill="#29354e"><text x="24" y="32" font-size="22">Electricity consumption · kWh</text>',
             '<text x="24" y="57" font-size="13">Recorded totals only; compare time coverage before drawing conclusions.</text>']
    for index, row in enumerate(data['totals']):
        y = 88 + index * 44
        width = float(Decimal(row['kwh']) / maximum) * 450
        parts += [f'<text x="24" y="{y + 16}" font-size="13">{escape(row["building"])}</text>',
                  f'<rect x="345" y="{y}" width="{width:.2f}" height="23" rx="4" fill="#7561b0"/>',
                  f'<text x="{805}" y="{y + 16}" font-size="13">{row["kwh"]}</text>']
    parts.append('</g></svg>')
    return ''.join(parts).encode('utf-8')


def project_report(data):
    lines = ['Campus energy investigation', 'Source: ' + data['filename'], 'Dataset SHA-256: ' + data['source_sha256'],
             'Source type: ' + data['source_kind'], 'Calculation engine: ' + data['engine'],
             'Unit: kWh', f'Observed period: {data["months"][0]} to {data["months"][-1]}',
             f'Rows: {data["row_count"]}; buildings: {data["building_count"]}',
             'Recorded total: ' + data['total_kwh'] + ' kWh', '', 'Totals by building:']
    lines += [f'{row["building"]}: {row["kwh"]} kWh across {row["observations"]} recorded month(s)' for row in data['totals']]
    lines += ['', 'Checks: source-row total equals grouped total; all rows accounted for; no duplicate building-month records.',
              'Coverage: ' + ('Uneven: some building-month observations are missing.' if data['uneven_coverage'] else 'All buildings cover the same recorded months.'),
              '', 'Limitations:', *data['limitations'], '',
              'Generated locally without AI. Raw readings have not been independently verified.',
              'CSV exports prefix formula-like building names with an apostrophe for spreadsheet safety.']
    return '\n'.join(lines).encode('utf-8')


def project_router(sessions):
    router = APIRouter()

    @router.get('/projects/sample.csv')
    def sample(request: Request):
        require_user(request)
        return Response(SAMPLE_CSV, media_type='text/csv', headers={'Content-Disposition': 'attachment; filename="sample-energy.csv"'})

    @router.post('/projects', status_code=201)
    def analyze(body: ProjectRequest, request: Request):
        require_user(request)
        with sessions() as db:
            existing = db.get(StudioRun, str(body.request_id))
            if existing:
                if existing.kind != 'project':
                    raise HTTPException(409, 'This request already belongs to another activity.')
                return public_run(existing)
            try:
                data = analyze_energy(SAMPLE_CSV if body.sample else body.csv_text,
                                      'sample-energy.csv' if body.sample else body.filename,
                                      'synthetic_sample' if body.sample else 'user_csv')
            except ValueError as exc:
                raise HTTPException(422, str(exc)) from None
            row = StudioRun(id=str(body.request_id), kind='project', title='Campus energy · ' + data['filename'][:150],
                            status='COMPLETED', data=data)
            db.add(row); db.commit()
            return public_run(row)

    @router.get('/projects/{key}/export/{format}')
    def export(key: str, format: Literal['cleaned.csv', 'summary.csv', 'chart.svg', 'report.txt'], request: Request):
        require_user(request)
        with sessions() as db:
            row = find_run(db, key, 'project'); data = row.data
        if format == 'cleaned.csv':
            content = csv_export(['building', 'month', 'kwh'], data['rows']); mime = 'text/csv'
        elif format == 'summary.csv':
            content = csv_export(['building', 'kwh', 'observations'], data['totals']); mime = 'text/csv'
        elif format == 'chart.svg':
            content = chart_svg(data); mime = 'image/svg+xml'
        else:
            content = project_report(data); mime = 'text/plain'
        return Response(content, media_type=mime, headers={'Content-Disposition': f'attachment; filename="energy-{format}"',
                        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'})

    return router
