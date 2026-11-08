import React from 'react';
import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {LocaleProvider,Translate,translateText,presetText,flowLabels} from './i18n';
import ar from './locales/ar.json';
import inventory from '../scripts/ui-inventory.json';

describe('bilingual interface',()=>{
 it('preserves chosen worker names exactly in either interface language',()=>{
  const html=renderToStaticMarkup(<LocaleProvider initialLanguage="ar"><Translate><strong translate="no">English</strong><span>Planning</span></Translate></LocaleProvider>);
  expect(html).toContain('>English</strong>');
  expect(html).not.toContain('>Planning</span>');
 });
 it('covers the extracted interface inventory',()=>{
  const catalog=ar as Record<string,string>;
  expect(inventory.filter(key=>!catalog[key]&&!key.startsWith('M {0}'))).toEqual([]);
 });
 it('translates dynamic messages and controls',()=>{
  expect(translateText('Up to 6','ar')).toMatch(/[\u0600-\u06ff]/);
  expect(translateText('Planning','ar')).not.toBe('Planning');
  expect(flowLabels('ar')['controls.zoomIn.ariaLabel']).not.toBe('Zoom In');
  expect(flowLabels('en')['controls.zoomIn.ariaLabel']).toBe('Zoom In');
  expect(translateText('Use the approved local fixture tool. This task needs original classroom data. Read it from the approved local fixture instead of guessing values, then pass the unmodified source onward.','ar')).not.toMatch(/[A-Za-z]{4}/);
 });
 it('localizes visible labels and accessible attributes while preserving inputs and evidence',()=>{
  const content=<Translate><section id="mission"><label title="Planning">Planning</label><input value="Original input" readOnly placeholder="Planning" aria-label="Planning"/><select defaultValue="live"><option value="live">Planning</option></select><pre>Planning</pre><code>Planning</code></section></Translate>;
  const arabic=renderToStaticMarkup(<LocaleProvider initialLanguage="ar">{content}</LocaleProvider>);
  const english=renderToStaticMarkup(<LocaleProvider initialLanguage="en">{content}</LocaleProvider>);
  expect(arabic).toContain('id="mission"');
  expect(arabic).toContain('value="Original input"');
  expect(arabic).toContain('value="live"');
  expect(arabic).toContain('<pre>Planning</pre>');
  expect(arabic).toContain('<code>Planning</code>');
  expect(arabic).not.toContain('aria-label="Planning"');
  expect(english).toContain('aria-label="Planning"');
 });
 it('restores a known preset while retaining custom mission text',()=>{
  const preset='Planning';
  expect(presetText(presetText(preset,'ar'),'en')).toBe(preset);
  expect(presetText('My own unusual mission 5182','ar')).toBe('My own unusual mission 5182');
  expect(translateText('Study cows and goats in my custom mission','ar')).toBe('Study cows and goats in my custom mission');
  expect(translateText('https://example.org/study/123','ar')).toBe('https://example.org/study/123');
 });
});
