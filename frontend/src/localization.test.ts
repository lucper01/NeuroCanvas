import { describe, expect, it } from 'vitest'
import { resolveLanguage, translateLabel, localizeTree } from './localization'
import { createElement } from 'react'
import { qualityWindows, validateMarkedSegment, overlapsSegment } from './qc'
import { demo, erp } from './engine'

describe('NeuroCanvas FR/EN internationalization', () => {
  it('uses French for fr, fr-FR and fr-CA browser locales', () => {
    expect(resolveLanguage('auto', 'fr-FR')).toBe('fr')
    expect(resolveLanguage('auto', 'fr-CA')).toBe('fr')
    expect(resolveLanguage('auto', 'en-US')).toBe('en')
    expect(resolveLanguage('auto', 'de-DE')).toBe('en')
  })
  it('honors manual language selection over navigator settings', () => {
    expect(resolveLanguage('en', 'fr-FR')).toBe('en')
    expect(resolveLanguage('fr', 'en-US')).toBe('fr')
  })
  it('translates interface labels both ways without remote requests', () => {
    expect(translateLabel('Importer', 'en')).toBe('Import')
    expect(translateLabel('Import', 'fr')).toBe('Importer')
    expect(translateLabel('  Personnalisation  ', 'en')).toBe('  Personalization  ')
    expect(translateLabel('Français', 'en')).toBe('French')
  })
  it('leaves channel labels, event labels and physical units intact', () => {
    for (const x of ['EEG Fz', 'Fz', 'stimulus-42', 'µV', '250 Hz', 'ECG_R_Peaks']) {
      expect(translateLabel(x, 'en')).toBe(x)
      expect(translateLabel(x, 'fr')).toBe(x)
    }
  })
  it('localizes label properties while preserving stable input values', () => {
    const original = createElement('input', { title: 'Importer', 'aria-label': 'Fermer', value: 'EEG Fz' })
    const result = localizeTree(original, 'en') as typeof original
    expect(result.props.title).toBe('Import')
    expect(result.props['aria-label']).toBe('Close')
    expect(result.props.value).toBe('EEG Fz')
  })
})

describe('Offline artifact screening', () => {
  it('marks only half-open intersecting intervals', () => {
    expect(overlapsSegment(2, 3, { start: 3, end: 4, reason: 'motion' })).toBe(false)
    expect(overlapsSegment(2, 3, { start: 2.99, end: 4, reason: 'motion' })).toBe(true)
  })
  it('validates boundaries and nonempty reasons', () => {
    expect(validateMarkedSegment(1, 2, 10, 'movement')).toEqual({ start: 1, end: 2, reason: 'movement' })
    expect(() => validateMarkedSegment(2, 1, 10, 'movement')).toThrow()
    expect(() => validateMarkedSegment(1, 12, 10, 'movement')).toThrow()
    expect(() => validateMarkedSegment(1, 2, 10, ' ')).toThrow()
  })
  it('generates traceable windows without changing raw arrays', () => {
    const rec = demo()
    const before = rec.raw[0][250]
    const result = qualityWindows(rec, 2, 'EEG Fz')
    expect(result.channel_results[0].windows).toHaveLength(20)
    expect(result.channel_results[0].windows[0].start).toBe(0)
    expect(rec.raw[0][250]).toBe(before)
  })
  it('only rejects marked overlapping epochs when explicitly enabled', () => {
    const rec = demo()
    const original = erp(rec, 'EEG Fz', 'stimulus')
    const updated = { ...rec, info: { ...rec.info, bad_segments:
      [{ start: 5, end: 5.1, reason: 'movement' }] } }
    expect(erp(updated, 'EEG Fz', 'stimulus').n).toBe(original.n)
    expect(erp(updated, 'EEG Fz', 'stimulus', -.2, .8, true).n).toBe(original.n - 1)
  })
})
