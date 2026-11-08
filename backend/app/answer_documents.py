"""Deterministic Word and PDF report writers; no application or network access."""
import io
import os
import re
from html import escape
from pathlib import Path
from urllib.parse import urlsplit

ARABIC=re.compile(r'[\u0600-\u06ff]')
LINK=re.compile(r'\[([^\]\n]+)\]\((https?://[^\s)]+)\)')

def safe_url(value):
    try:
        parsed=urlsplit(value)
        return parsed.scheme in ('http','https') and bool(parsed.hostname) and not parsed.username and not parsed.password
    except (ValueError,TypeError):return False

def clean_text(value):
    return ''.join(c for c in str(value) if c in '\n\t' or ord(c)>=32).replace('\x7f','')

def plain(value):
    value=LINK.sub(lambda m:(m[2] if m[1]==m[2] else f'{m[1]} ({m[2]})') if safe_url(m[2]) else m[1],clean_text(value))
    return re.sub(r'\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`',lambda m:next(g for g in m.groups() if g is not None),value)

def rtl(value):
    return len(ARABIC.findall(value))>len(re.findall('[A-Za-z]',value))

def blocks(content):
    lines=clean_text(content).replace('\r','').split('\n');i=0
    def cells(s):return [c.strip() for c in s.strip().strip('|').split('|')]
    while i<len(lines):
        line=lines[i]
        if not line.strip():i+=1;continue
        h=re.match(r'^(#{1,6})\s+(.+)$',line)
        if h:yield ('heading',min(len(h[1]),3),h[2]);i+=1;continue
        if line.startswith('```'):
            text=[];i+=1
            while i<len(lines) and not lines[i].startswith('```'):text.append(lines[i]);i+=1
            i+=1;yield ('code',0,'\n'.join(text));continue
        if i+1<len(lines) and '|' in line and len(cells(lines[i+1]))>=2 and all(re.fullmatch(':?-{3,}:?',c) for c in cells(lines[i+1])):
            rows=[cells(line)];i+=2
            while i<len(lines) and lines[i].strip() and '|' in lines[i]:rows.append(cells(lines[i]));i+=1
            yield ('table',0,rows);continue
        bullet=re.match(r'^\s*([-*+]|\d+[.)])\s+(.+)$',line)
        if bullet:yield ('list',bullet[1],bullet[2]);i+=1;continue
        if re.fullmatch(r'\s*(---+|\*\*\*+)\s*',line):i+=1;continue
        if line.startswith('>'):yield ('quote',0,line.lstrip('> '));i+=1;continue
        text=[line];i+=1
        while i<len(lines) and lines[i].strip() and not re.match(r'^(#{1,6}\s|```|>|\s*([-*+]|\d+[.)])\s)',lines[i]) and not (i+1<len(lines) and '|' in lines[i] and all(re.fullmatch(':?-{3,}:?',c) for c in cells(lines[i+1]))):text.append(lines[i]);i+=1
        yield ('paragraph',0,'\n'.join(text))

def document_sections(package):
    ar=rtl(package['goal']+' '+package['content'])
    yield ('heading',1,'الهدف الأصلي' if ar else 'Original goal')
    yield ('paragraph',0,package['goal'])
    yield ('heading',1,('مسودة موجّه قابلة لإعادة الاستخدام' if ar else 'Reusable prompt draft') if package['variant']=='prompt' else ('الإجابة' if ar else 'Answer'))
    yield from blocks(package['content'])
    if package.get('limitations'):
        yield ('heading',1,'القيود وما يحتاج إلى تحقق' if ar else 'Limitations and verification needs')
        for value in package['limitations']:yield ('list','-',value)
    if package.get('sources'):
        yield ('heading',1,'المصادر' if ar else 'Sources')
        for source in package['sources']:
            yield ('paragraph',0,source['title'])
            yield ('paragraph',0,f"[{source['url']}]({source['url']})")

def report_status(package):
    ar=rtl(package['goal']+' '+package['content'])
    if package['variant']=='prompt':return 'مسودة موجّه قابلة للمراجعة قبل الاستخدام' if ar else 'Reusable prompt draft - review before use'
    if package['master_approved']:return 'إجابة المهمة المعتمدة من الوكيل القائد' if ar else 'Master-approved mission answer'
    return 'مخرج محاكاة تعليمية' if ar else 'Classroom simulation output'

def make_docx(package):
    from docx import Document
    from docx.shared import Inches,Pt,RGBColor
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.opc.constants import RELATIONSHIP_TYPE as RT
    doc=Document();section=doc.sections[0]
    section.page_width=Inches(8.2677);section.page_height=Inches(11.6929)
    section.top_margin=section.bottom_margin=Inches(.8)
    section.left_margin=section.right_margin=Inches(.85)
    for name in ('Normal','Title','Subtitle','Heading 1','Heading 2','Heading 3','List Bullet','List Number'):
        style=doc.styles[name];style.font.name='Arial';style.element.get_or_add_rPr().get_or_add_rFonts().set(qn('w:cs'),'Arial')
    normal=doc.styles['Normal'];normal.font.size=Pt(11);normal.paragraph_format.line_spacing=1.2;normal.paragraph_format.space_after=Pt(8)
    doc.styles['Title'].font.color.rgb=RGBColor(0,0,0);doc.styles['Title'].font.size=Pt(25)
    for level,size in ((1,17),(2,14),(3,12)):
        style=doc.styles[f'Heading {level}'];style.font.size=Pt(size);style.font.color.rgb=RGBColor.from_string('55406E');style.paragraph_format.keep_with_next=True;style.paragraph_format.space_before=Pt(16)
    def direction(p,text):
        if rtl(text):
            p.alignment=WD_ALIGN_PARAGRAPH.RIGHT
            ppr=p._p.get_or_add_pPr();bidi=OxmlElement('w:bidi');ppr.append(bidi)
    def run_text(p,text):
        # Format public markdown inline without interpreting raw HTML.
        pattern=re.compile(r'(\[[^\]\n]+\]\(https?://[^\s)]+\)|\*\*[^*]+\*\*|`[^`]+`)')
        for chunk in pattern.split(clean_text(text)):
            link=LINK.fullmatch(chunk)
            if link and safe_url(link[2]):
                node=OxmlElement('w:hyperlink');node.set(qn('r:id'),p.part.relate_to(link[2],RT.HYPERLINK,is_external=True))
                r=OxmlElement('w:r');pr=OxmlElement('w:rPr');style=OxmlElement('w:rStyle');style.set(qn('w:val'),'Hyperlink');pr.append(style);r.append(pr);t=OxmlElement('w:t');t.text=link[1];r.append(t);node.append(r);p._p.append(node)
            else:
                run=p.add_run(chunk[2:-2] if chunk.startswith('**') and chunk.endswith('**') else chunk[1:-1] if chunk.startswith('`') and chunk.endswith('`') else chunk)
                if chunk.startswith('**'):run.bold=True
                if chunk.startswith('`'):run.font.name='Consolas';run.font.size=Pt(9)
    p=doc.add_paragraph(style='Title');run_text(p,package['title']);direction(p,package['title'])
    status=report_status(package)
    p=doc.add_paragraph(status,style='Subtitle');direction(p,status);p.paragraph_format.space_after=Pt(16)
    for kind,level,value in document_sections(package):
        if kind=='table':
            width=max(len(row) for row in value);table=doc.add_table(rows=0,cols=width);table.style='Light Shading Accent 1'
            if rtl(' '.join(cell for row in value for cell in row)):
                bidi=OxmlElement('w:bidiVisual');table._tbl.tblPr.append(bidi)
            for n,row in enumerate(value):
                cells=table.add_row().cells
                for c,text in enumerate(row):
                    p=cells[c].paragraphs[0];run_text(p,text);direction(p,text)
                    if n==0:
                        for r in p.runs:r.bold=True
                if n==0:
                    repeat=OxmlElement('w:tblHeader');table.rows[0]._tr.get_or_add_trPr().append(repeat)
            doc.add_paragraph();continue
        style=f'Heading {level}' if kind=='heading' else 'List Number' if kind=='list' and str(level)[0].isdigit() else 'List Bullet' if kind=='list' else 'Normal'
        p=doc.add_paragraph(style=style);run_text(p,value);direction(p,value)
        if kind=='code':
            for r in p.runs:r.font.name='Consolas';r.font.size=Pt(9)
        if kind=='quote':p.paragraph_format.left_indent=Inches(.2)
    header=section.header.paragraphs[0];header.text='AGENT LAB  |  MISSION REPORT';header.runs[0].font.size=Pt(8);header.runs[0].font.color.rgb=RGBColor.from_string('88808F')
    footer=section.footer.paragraphs[0];footer.alignment=WD_ALIGN_PARAGRAPH.CENTER
    footer.add_run('Agent Lab  |  ');field=OxmlElement('w:fldSimple');field.set(qn('w:instr'),'PAGE');footer._p.append(field)
    for r in footer.runs:r.font.size=Pt(8)
    doc.core_properties.title=package['title'];doc.core_properties.subject='Mission answer' if package['variant']=='answer' else 'Reusable prompt draft';doc.core_properties.author='Agent Lab'
    stream=io.BytesIO();doc.save(stream);return stream.getvalue()

def pdf_fonts():
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    if 'LabBody' in pdfmetrics.getRegisteredFontNames():return
    candidates=[(Path(os.getenv('WINDIR','C:/Windows'))/'Fonts/arial.ttf',Path(os.getenv('WINDIR','C:/Windows'))/'Fonts/arialbd.ttf'),
        (Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'),Path('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))]
    normal,bold=next(((n,b) for n,b in candidates if n.exists() and b.exists()),(None,None))
    if not normal:raise RuntimeError('PDF fonts are missing. Install Arial or DejaVu Sans on the backend.')
    pdfmetrics.registerFont(TTFont('LabBody',str(normal)));pdfmetrics.registerFont(TTFont('LabBold',str(bold)))
    pdfmetrics.registerFontFamily('LabBody',normal='LabBody',bold='LabBold',italic='LabBody',boldItalic='LabBold')

def make_pdf(package):
    from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Table,TableStyle,Flowable
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.enums import TA_RIGHT,TA_LEFT
    from reportlab.pdfbase.pdfmetrics import stringWidth
    import arabic_reshaper
    from bidi.algorithm import get_display
    pdf_fonts();stream=io.BytesIO();page_width,page_height=A4;margin=52;usable=page_width-2*margin
    class ArabicLines(Flowable):
        def __init__(self,text,style,lines=None):
            Flowable.__init__(self);self.text=text;self.style=style;self.lines=lines;self.keepWithNext=style.keepWithNext;self.spaceAfter=style.spaceAfter
        def wrap(self,width,height):
            self.width=width
            if self.lines is None:
                self.lines=[]
                for paragraph in plain(self.text).split('\n'):
                    line=''
                    words=[]
                    for token in paragraph.split():
                        if stringWidth(get_display(arabic_reshaper.reshape(token)),self.style.fontName,self.style.fontSize)>width:
                            chunk=''
                            for char in token:
                                if chunk and stringWidth(get_display(arabic_reshaper.reshape(chunk+char)),self.style.fontName,self.style.fontSize)>width:words.append(chunk);chunk=char
                                else:chunk+=char
                            if chunk:words.append(chunk)
                        else:words.append(token)
                    for word in words:
                        candidate=(line+' '+word).strip()
                        if stringWidth(get_display(arabic_reshaper.reshape(candidate)),self.style.fontName,self.style.fontSize)>width and line:self.lines.append(line);line=word
                        else:line=candidate
                    self.lines.append(line)
            self.height=len(self.lines)*self.style.leading;return width,self.height
        def split(self,width,height):
            self.wrap(width,height);count=int(height//self.style.leading)
            if count<1:return []
            if count>=len(self.lines):return [self]
            return [ArabicLines('',self.style,self.lines[:count]),ArabicLines('',self.style,self.lines[count:])]
        def draw(self):
            self.canv.setFont(self.style.fontName,self.style.fontSize);self.canv.setFillColor(self.style.textColor)
            for n,line in enumerate(self.lines):self.canv.drawRightString(self.width,self.height-(n+1)*self.style.leading+3,get_display(arabic_reshaper.reshape(line)))
    styles={}
    for name,size,bold in [('title',23,True),('heading1',16,True),('heading2',13,True),('heading3',11,True),('body',10.5,False),('small',8.5,False),('cell',9,False)]:
        styles[name]=ParagraphStyle(name,fontName='LabBold' if bold else 'LabBody',fontSize=size,leading=size*1.5,textColor=colors.HexColor('#000000' if name=='title' else '#55406e' if bold else '#3e3c46'),spaceAfter=9,spaceBefore=12 if name.startswith('heading') else 0,keepWithNext=bold,splitLongWords=True)
    def paragraph(text,style):
        if ARABIC.search(text):return ArabicLines(text,style)
        parts=[];cursor=0
        for match in LINK.finditer(clean_text(text)):
            parts.append(escape(text[cursor:match.start()]))
            parts.append(f'<link href="{escape(match[2],quote=True)}" color="#745294">{escape(match[1])}</link>' if safe_url(match[2]) else escape(match[1]))
            cursor=match.end()
        parts.append(escape(text[cursor:]));safe=''.join(parts)
        safe=re.sub(r'\*\*([^*]+)\*\*',r'<b>\1</b>',safe)
        safe=re.sub(r'`([^`]+)`',r'\1',safe)
        return Paragraph(safe.replace('\n','<br/>'),style)
    story=[paragraph(package['title'],styles['title'])]
    status=report_status(package)
    story.extend([paragraph(status,styles['small']),Spacer(1,9)])
    for kind,level,value in document_sections(package):
        if kind=='table':
            if rtl(' '.join(cell for row in value for cell in row)):value=[list(reversed(row)) for row in value]
            cols=max(len(row) for row in value);width=usable/cols
            rows=[[paragraph(cell,styles['cell']) for cell in row]+['']*(cols-len(row)) for row in value]
            table=Table(rows,colWidths=[width]*cols,repeatRows=1,splitByRow=1,splitInRow=1,hAlign='LEFT')
            table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#eee7f5')),('GRID',(0,0),(-1,-1),.4,colors.HexColor('#ddd5e6')),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),7)]));story.extend([table,Spacer(1,12)]);continue
        style=styles[f'heading{level}'] if kind=='heading' else styles['body']
        if kind=='list':value=f'{level if str(level)[0].isdigit() else "•"} {value}'
        story.append(paragraph(value,style))
    def footer(canvas,doc):
        canvas.setFont('LabBody',8);canvas.setFillColor(colors.HexColor('#93889d'));canvas.drawString(margin,25,'Agent Lab | Mission report');canvas.drawRightString(page_width-margin,25,str(doc.page))
    doc=SimpleDocTemplate(stream,pagesize=A4,leftMargin=margin,rightMargin=margin,topMargin=46,bottomMargin=45,title=package['title'],author='Agent Lab')
    doc.build(story,onFirstPage=footer,onLaterPages=footer);return stream.getvalue()

