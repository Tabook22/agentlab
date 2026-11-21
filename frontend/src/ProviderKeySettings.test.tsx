import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {test,expect} from 'vitest';
import {ProviderKeySettings} from './ProviderKeySettings';
import {LocaleProvider} from './i18n';
test('admin key form offers a write-only password field and distinguishes saving from verification',()=>{
 const html=renderToStaticMarkup(<ProviderKeySettings configured={false} onSaved={async()=>{}}/>);
 for(const text of ['type="password"','autoComplete="new-password"','No key configured','Save API key','Saving makes no paid API request','never displayed'])expect(html).toContain(text);
 expect(html).not.toContain('localStorage');
});
test('configured keys can be replaced without revealing the saved key, including in Arabic',()=>{
 const html=renderToStaticMarkup(<ProviderKeySettings configured onSaved={async()=>{}}/>);
 expect(html).toContain('Replace API key');expect(html).toContain('value=""');
 const ar=renderToStaticMarkup(<LocaleProvider initialLanguage="ar"><ProviderKeySettings configured onSaved={async()=>{}}/></LocaleProvider>);
 expect(ar).toContain('استبدال المفتاح');
});
