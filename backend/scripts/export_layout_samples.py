"""Small representative layout fixtures for manual export QA."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.answer_documents import make_docx,make_pdf
root=Path(__file__).resolve().parents[2]/'tmp'/'export-qa'
root.mkdir(parents=True,exist_ok=True)
samples={
'en':{'title':'Sensor study implementation plan','goal':'Design a practical system for measuring animal behaviour and evaluating a pilot.','content':'## Recommended solution\nUse **GPS and motion sensors** with direct observation to validate the behaviour labels.\n\n## Implementation\n1. Define acceptance criteria and recruit a pilot group.\n2. Compare sensor readings with observed behaviour.\n3. Review the results before scaling the deployment.\n\n| Component | Purpose | Indicative cost |\n| --- | --- | --- |\n| GPS logger | Position and movement | Obtain a local quote |\n| Motion sensor | Behaviour classification | Validate during pilot |\n\n## Acceptance criteria\n- Track data completeness and classification accuracy.\n- Document limitations and decisions needed from the user.','limitations':['Indicative costs require local validation. This example is a layout test.'],'sources':[{'title':'Reference example','url':'https://example.org/study?a=1&b=2'}]},
'ar':{'title':'خطة تنفيذ نظام متابعة الجودة','goal':'تصميم نظام واضح يساعد المستخدم على فهم العمل ومتابعة تنفيذ المهام وتقييم النتائج.','content':'## الحل المقترح\nإنشاء لوحة متابعة تجمع المتطلبات والمهام والأدلة في مكان واحد، مع توضيح مسؤولية كل عضو في الفريق.\n\n## خطوات التنفيذ\n1. تحديد احتياجات المستخدم ومعايير القبول قبل بدء التنفيذ.\n2. إعداد نموذج أولي واختباره مع مجموعة صغيرة من المستخدمين.\n3. مراجعة الملاحظات وتحسين التصميم قبل التوسع.\n\n| المرحلة | المخرج المتوقع | معيار القبول |\n| --- | --- | --- |\n| التخطيط | متطلبات واضحة | اعتماد الفريق |\n| التجربة | نموذج قابل للاستخدام | توثيق الملاحظات |\n| المراجعة | تقرير بالنتائج | وضوح الأدلة |\n\n## معايير النجاح\n- سهولة الوصول إلى المعلومة وفهم الخطوة التالية.\n- المحافظة على البيانات والمصادر والقيود دون حذف.','limitations':['هذه عينة لاختبار تنسيق المستند، وليست نتيجة مهمة حقيقية.'],'sources':[{'title':'مرجع توضيحي','url':'https://example.org/quality'}]}
}
for language,values in samples.items():
 package={**values,'mission_id':'layout-test','master_approved':True,'mode':'live','variant':'answer'}
 fmt=sys.argv[1]
 content=make_docx(package) if fmt=='docx' else make_pdf(package)
 path=root/f'layout-{language}.{fmt}'
 path.write_bytes(content)
 print(path)
