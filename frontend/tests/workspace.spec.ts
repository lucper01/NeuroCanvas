import { test, expect } from '@playwright/test'

test('interactive workspace navigation, spectra and export', async ({ page, isMobile }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/NeuroCanvas/)
  await expect(page.getByRole('heading', { name: 'Your signal workspace' })).toBeVisible()
  await expect(page.getByText('Démonstration physiologique synthétique', { exact: true })).toBeVisible()

  const navigate = async (title: string) => {
    if (isMobile) await page.getByRole('button', { name: 'Menu', exact: true }).click()
    await page.getByRole('button', { name: title, exact: true }).click()
  }
  await navigate('Signal Explorer')
  await expect(page.getByRole('heading', { name: 'Time-domain explorer' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Channel inspector' })).toBeVisible()

  await navigate('Signal Processing')
  await expect(page.getByText('Pipeline vierge')).toBeVisible()

  await navigate('Frequency Lab')
  await expect(page.getByText('Power spectral density (Welch)')).toBeVisible({ timeout: 20_000 })
  await page.getByLabel('Méthode').selectOption('FFT')
  await expect(page.getByText('FFT · spectre d\'amplitude')).toBeVisible()

  await navigate('Learning Studio')
  await expect(page.getByRole('heading', { name: 'Signal synthesis laboratory' })).toBeVisible()
  await page.getByRole('button', { name: 'Régénérer les signaux' }).click()
  await expect(page.getByRole('status')).toContainText('Démonstration synthétique chargée.')

  await navigate('Export & Reproducibility')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'CSV traité' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('neurocanvas_processed.csv')
})

test('offline-compatible CSV import without backend', async ({ page, isMobile }) => {
  await page.goto('/')
  const csv = 'time_s,Fz,Cz\n0,1,2\n0.004,2,3\n0.008,3,4\n0.012,4,5\n'
  const input = page.locator('input[type=file]').first()
  await input.setInputFiles({ name: 'synthetic.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
  await expect(page.getByText('CSV chargé localement dans le navigateur.')).toBeVisible()
  await expect(page.getByText('synthetic.csv', { exact: true }).first()).toBeVisible()
  if (isMobile) await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page.getByRole('button', { name: 'Export & Reproducibility' }).click()
  await expect(page.getByRole('heading', { name: 'Recording audit trail' })).toBeVisible()
})
