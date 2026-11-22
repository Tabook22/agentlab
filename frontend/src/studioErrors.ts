const messages:Record<string,string>={
 'Practice record not found.':'لم يُعثر على سجل التدريب.',
 'This request already belongs to another activity.':'يرتبط هذا الطلب بنشاط آخر بالفعل.',
 'Explain your rules in at least ten visible characters.':'اشرح قواعدك بعشرة أحرف ظاهرة على الأقل.',
 'This activity changed. Reopen its saved record before submitting.':'تغيّر هذا النشاط. افتح سجله المحفوظ مجددًا قبل التقديم.',
 'Start a fresh practice activity to continue.':'ابدأ نشاط تدريب جديدًا للمتابعة.',
 'Another submission arrived. Reopen the saved record.':'وصل تقديم آخر. افتح السجل المحفوظ مجددًا.',
 'Write a prediction of at least ten visible characters.':'اكتب توقعًا بعشرة أحرف ظاهرة على الأقل.',
 'Write a reflection of at least ten visible characters.':'اكتب تفسيرًا بعشرة أحرف ظاهرة على الأقل.',
 'This experiment changed. Reopen the saved record.':'تغيّرت هذه التجربة. افتح السجل المحفوظ مجددًا.',
 'Another reflection arrived. Reopen the saved record.':'وصل تفسير آخر. افتح السجل المحفوظ مجددًا.',
 'CSV input exceeds 512 KB. Use a smaller dataset.':'يتجاوز ملف CSV الحد الأقصى البالغ ٥١٢ كيلوبايت. استخدم بيانات أصغر.',
 'Use exactly these CSV columns in order: building,month,kwh.':'استخدم هذه الأعمدة بالترتيب: building,month,kwh.',
 'Use at most 5,000 data rows.':'استخدم ٥٠٠٠ صف بيانات كحد أقصى.',
 'expected exactly three values.':'يجب أن يحتوي الصف على ثلاث قيم فقط.',
 'use a building name of 1–80 characters without control characters.':'استخدم اسم مبنى من حرف إلى ٨٠ حرفًا دون أحرف تحكم.',
 'month must use YYYY-MM, for example 2026-01.':'استخدم تنسيق YYYY-MM للشهر، مثل 2026-01.',
 'kwh must be a finite non-negative number.':'يجب أن تكون قيمة kwh عددًا منتهيًا غير سالب.',
 'kwh must be between 0 and 1,000,000,000.':'يجب أن تكون قيمة kwh بين صفر و١٬٠٠٠٬٠٠٠٬٠٠٠.',
 'kwh precision is unsupported.':'دقة قيمة kwh غير مدعومة.',
 'kwh supports at most three decimal places.':'تدعم kwh ثلاث منازل عشرية كحد أقصى.',
 'duplicate building and month. Resolve the duplicate before analysis.':'يتكرر المبنى والشهر. عالج التكرار قبل التحليل.',
 'use consistent capitalization for each building.':'استخدم كتابة موحّدة للأحرف الكبيرة والصغيرة في اسم كل مبنى.',
 'Use at most 100 buildings per project.':'استخدم ١٠٠ مبنى كحد أقصى لكل مشروع.',
 'The CSV quoting is malformed. Check the file and try again.':'علامات الاقتباس في CSV غير صحيحة. راجع الملف وحاول مجددًا.',
 'Add at least one data row after the CSV header.':'أضف صف بيانات واحدًا على الأقل بعد عناوين CSV.',
 'The independent checks did not agree. This project was not saved.':'لم تتطابق الفحوص المستقلة. لم يُحفظ المشروع.',
 'Failed to fetch':'تعذر الاتصال بالخادم. تحقق من الاتصال ثم حاول مجددًا.',
 'Could not complete this activity.':'تعذر إكمال النشاط. حاول مجددًا.',
};
export function studioError(message:string,ar:boolean){
 if(!ar)return message;
 const row=message.match(/^CSV row (\d+): (.*)$/);
 if(row)return `صف CSV ${row[1]}: ${messages[row[2]]??row[2]}`;
 if(/^Could not complete this activity \(422\)\./.test(message))return 'راجع الحقول المطلوبة والحدود الموضحة ثم حاول مجددًا.';
 return messages[message]??'تعذر إكمال النشاط. أعد فتح السجل أو تحقق من البيانات وحاول مجددًا.';
}
