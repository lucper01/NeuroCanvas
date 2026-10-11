import { test, expect } from '@playwright/test'

test.describe('Scientific trial review and reproducibility',()=>{
  test.use({locale:'fr-FR'})

  test('curates one trial and exports condition reports without touching source data',
    async({page,isMobile})=>{
      await page.goto('/')
      if(isMobile)await page.getByRole('button',{name:'Menu'}).click()
      await page.getByRole('button',{name:'Trigger & Epoch Studio',exact:true}).click()

      const protocolDownload=page.waitForEvent('download')
      await page.getByRole('button',{name:'Exporter le protocole'}).click()
      expect((await protocolDownload).suggestedFilename()).toBe('neurocanvas_analysis_protocol.json')

      await page.getByRole('button',{name:'Prévisualiser'}).click()
      await expect(page.getByText('11 : 2')).toBeVisible()
      await page.getByRole('button',{name:'Confirmer les triggers'}).click()

      await page.getByRole('combobox',{name:'Condition',exact:true}).selectOption('Visual')
      await page.getByRole('button',{name:'Calculer les époques'}).click()
      await expect(page.getByText('Carte thermique des essais')).toBeVisible()

      await page.getByRole('button',{name:'Rejeter cet essai'}).click()
      await expect(page.getByText(/Veuillez recalculer les époques après une décision/)).toBeVisible()

      await page.getByRole('checkbox',{name:'Exclure les essais rejetés'}).check()
      await page.getByRole('button',{name:'Calculer les époques'}).click()
      await expect(page.getByRole('button',{name:'Rejeter cet essai'})).toBeVisible()

      await page.getByRole('button',{name:'Calculer les mesures'}).click()
      await expect(page.getByRole('button',{name:'Exporter mesures CSV'})).toBeEnabled()

      const metricsDownload=page.waitForEvent('download')
      await page.getByRole('button',{name:'Exporter mesures CSV'}).click()
      expect((await metricsDownload).suggestedFilename()).toBe('neurocanvas_condition_metrics.csv')

      const reviewDownload=page.waitForEvent('download')
      await page.getByRole('button',{name:'Export des décisions'}).click()
      expect((await reviewDownload).suggestedFilename()).toBe('neurocanvas_trial_review.json')
    })
})
