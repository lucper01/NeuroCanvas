import { test, expect } from '@playwright/test'

test.describe('Trigger codes, conditions and epoch workflows', () => {
  test.use({ locale:'fr-FR' })

  test('detects TTL pulses, groups two codes into one condition and exports epochs', async ({page,isMobile}) => {
    await page.goto('/')
    if(isMobile)await page.getByRole('button',{name:'Menu'}).click()
    await page.getByRole('button',{name:'Trigger & Epoch Studio',exact:true}).click()
    await expect(page.getByText('01 · Détection depuis le signal brut')).toBeVisible()
    await page.getByRole('button',{name:'Prévisualiser'}).click()
    await expect(page.getByText('11 : 2')).toBeVisible()
    await page.getByRole('button',{name:'Confirmer les triggers'}).click()
    await expect(page.getByText(/Marqueurs confirmés/)).toBeVisible()

    await page.getByRole('checkbox',{name:'Sélectionner 11'}).check()
    await page.getByRole('checkbox',{name:'Sélectionner 12'}).check()
    await page.getByRole('textbox',{name:'Condition commune'}).fill('Condition combinée')
    await page.getByRole('button',{name:'Regrouper les codes sélectionnés'}).click()
    await page.getByRole('button',{name:'Enregistrer les correspondances'}).click()
    await expect(page.getByText(/Correspondances enregistrées/)).toBeVisible()

    await page.getByRole('combobox',{name:'Condition',exact:true}).selectOption('Condition combinée')
    await page.getByRole('button',{name:'Calculer les époques'}).click()
    await expect(page.getByText('4', {exact:true}).first()).toBeVisible()
    await expect(page.getByText('Moyenne par condition')).toBeVisible()
    const download=page.waitForEvent('download')
    await page.getByRole('button',{name:'Exporter les époques CSV'}).click()
    const downloaded=await download
    expect(downloaded.suggestedFilename()).toBe('neurocanvas_epochs.csv')
  })
})
