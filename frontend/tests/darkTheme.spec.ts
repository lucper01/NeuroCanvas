import { test, expect } from '@playwright/test'

test.describe('Neural Night immersive dashboard',()=>{
  test.use({locale:'fr-FR'})

  test('renders real scientific signal previews and five genuine frequency bands',async({page,isMobile})=>{
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-theme','dark')
    await expect(page.locator('.shell')).toHaveClass(/theme-dark/)
    await expect(page.locator('.neuro-brain-art svg')).toBeVisible()
    await expect(page.locator('.neuro-band-card')).toHaveCount(5)
    await expect(page.locator('.floating-import')).toHaveCount(0)
    await expect(page.locator('.neuro-wave-row').first()).toBeVisible()
    await expect(page.getByText('Aucun état cognitif inféré.')).toBeVisible()
    await expect(page.locator('.neuro-spectrum-bar')).toHaveCount(5)

    if (!isMobile) {
      await page.screenshot({path:'test-results/dashboard-desktop.png',fullPage:true})
    } else {
      await page.screenshot({path:'test-results/dashboard-mobile.png',fullPage:true})
    }

    await page.getByRole('button',{name:/Triggers & époques/}).click()
    await expect(page.getByText('01 · Détection depuis le signal brut')).toBeVisible()
  })

  test('switches dark and light visual themes without losing localization or recording',async({page})=>{
    await page.goto('/')
    await page.getByRole('button',{name:/Personnalisation/}).click()
    const dlg=page.getByRole('dialog')
    await expect(dlg.getByRole('heading',{name:'Apparence'})).toBeVisible()
    await expect(dlg.getByRole('heading',{name:'Paramètres d’importation'})).toBeVisible()
    await expect(dlg.getByRole('button',{name:'Importer une session JSON'})).toBeVisible()
    await dlg.getByRole('radio',{name:/Clair/}).check()
    await expect(page.locator('html')).toHaveAttribute('data-theme','light')
    await expect(page.locator('.shell')).toHaveClass(/theme-light/)
    await dlg.getByRole('button',{name:'Appliquer'}).click()
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme','light')
    await expect(page.locator('.neuro-brain-art')).toBeVisible()
    await expect(page.getByText('Données synthétiques')).toBeVisible()
    await page.getByRole('button',{name:/Personnalisation/}).click()
    await page.getByRole('dialog').getByRole('radio',{name:/Sombre/}).check()
    await expect(page.locator('html')).toHaveAttribute('data-theme','dark')
  })
})
