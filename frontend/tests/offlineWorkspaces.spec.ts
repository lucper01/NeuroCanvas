import { expect,test } from '@playwright/test'

test.describe('Offline scientific workspaces',()=>{
  test.use({locale:'fr-FR'})

  test('builds multichannel QC screening and exports a standalone scientific report',
    async({page,isMobile})=>{
      await page.goto('/')
      if(isMobile)await page.getByRole('button',{name:'Menu'}).click()
      await page.getByRole('button',{name:'Artifact Review',exact:true}).click()
      const matrix=page.locator('.qc-matrix-panel')
      await expect(matrix).toBeVisible()
      await matrix.getByRole('button',{name:'Analyser tous les canaux'}).click()
      await expect(matrix.locator('.qc-matrix-plot .main-svg').first()).toBeVisible()
      await expect(matrix.locator('.qc-matrix-table tbody tr')).toHaveCount(7)

      const downloadCSV=page.waitForEvent('download')
      await matrix.getByRole('button',{name:/Exporter toutes les fenêtres CSV/}).click()
      expect((await downloadCSV).suggestedFilename()).toBe('neurocanvas_all_channels_qc.csv')

      await matrix.getByRole('button',{name:'Inspecter'}).first().click()
      await expect(page.getByText(/Contrôle descriptif calculé|Canal sélectionné/)).toBeVisible()

      if(isMobile)await page.getByRole('button',{name:'Menu'}).click()
      await page.getByRole('button',{name:'Export & Reproducibility',exact:true}).click()
      await expect(page.getByRole('heading',{name:'Rapport scientifique reproductible'})).toBeVisible()
      const downloadHTML=page.waitForEvent('download')
      await page.getByRole('button',{name:'Rapport HTML imprimable'}).click()
      expect((await downloadHTML).suggestedFilename()).toBe('neurocanvas_scientific_audit.html')
      const downloadJSON=page.waitForEvent('download')
      await page.getByRole('button',{name:'Audit structuré JSON'}).click()
      expect((await downloadJSON).suggestedFilename()).toBe('neurocanvas_scientific_audit.json')
    })

  test('exports processing recipe, imports it and requires explicit confirmation',
    async({page,isMobile})=>{
      await page.goto('/')
      if(isMobile)await page.getByRole('button',{name:'Menu'}).click()
      await page.getByRole('button',{name:'Signal Processing',exact:true}).click()
      const studio=page.locator('.recipe-toolbar')
      await expect(studio.getByText('Processing Recipe Studio')).toBeVisible()
      const download=page.waitForEvent('download')
      await studio.getByRole('button',{name:'Exporter recette JSON'}).click()
      expect((await download).suggestedFilename()).toBe('neurocanvas_processing_recipe.json')
      const recipe={
        schema:'neurocanvas.processing-recipe.v1',
        title:'Exploratory EEG',
        created_at:'2026-01-01T00:00:00Z',
        sampling_rate_hz:250,
        channels:[
          {name:'EEG Fz',type:'eeg',unit:'µV'},
          {name:'EEG Cz',type:'eeg',unit:'µV'}
        ],
        steps:[{method:'filter',channels:['EEG Fz','EEG Cz'],low:1,high:40}]
      }
      await studio.locator('input[type=file]').setInputFiles({
        name:'recipe.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(recipe))
      })
      await expect(studio.getByText('Exploratory EEG')).toBeVisible()
      await expect(page.locator('.steps')).toContainText('Pipeline vierge')
      await studio.getByRole('button',{name:'Appliquer cette recette'}).click()
      await expect(page.locator('.steps')).toContainText('filter')
      await expect(studio.getByRole('button',{name:'Appliquer cette recette'})).toHaveCount(0)
    })

  test('inspects a batch of recording files with no server upload',
    async({page,isMobile})=>{
      await page.goto('/')
      if(isMobile)await page.getByRole('button',{name:'Menu'}).click()
      await page.getByRole('button',{name:'Batch Inventory',exact:true}).click()
      const studio=page.locator('.batch-studio')
      await studio.locator('input[type=file]').setInputFiles([
        {name:'data.csv',mimeType:'text/csv',buffer:Buffer.from('time_s,EEG Cz,TRIGGER TTL\n0,1,0\n.004,2,11')},
        {name:'raw.fif',mimeType:'application/octet-stream',buffer:Buffer.from('test')}
      ])
      await expect(studio.locator('.batch-table tbody tr')).toHaveCount(2)
      await expect(studio.getByText('Lecture de l’en-tête CSV uniquement',{exact:false})).toBeVisible()
      const download=page.waitForEvent('download')
      await studio.getByRole('button',{name:'CSV',exact:true}).click()
      expect((await download).suggestedFilename()).toBe('neurocanvas_dataset_inventory.csv')
    })
})
