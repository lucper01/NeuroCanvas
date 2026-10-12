import { test, expect } from '@playwright/test'

test.describe('Universal Python Engine Manager',()=>{
  test.use({locale:'fr-FR'})

  test('allows an international researcher to choose browser or institutional HTTPS compute',
    async({page,isMobile})=>{
      await page.route('https://science.example.org/api/**',async route=>{
        const url=route.request().url()
        if(url.endsWith('/health'))return route.fulfill({
          status:200, contentType:'application/json',
          headers:{'Access-Control-Allow-Origin':'*'},
          body:JSON.stringify({status:'ok',engine:'Python / SciPy',mne:'1.9',
            neurokit2:'0.2',mode:'shared',auth:'guest'})
        })
        if(url.endsWith('/access/guest'))return route.fulfill({
          status:200,contentType:'application/json',
          headers:{'Access-Control-Allow-Origin':'*'},
          body:JSON.stringify({token:'signed-test-guest',expires_in:7200})
        })
        return route.fulfill({status:404,body:'unknown request'})
      })
      await page.goto('/')
      await expect(page.locator('.status-pill')).toContainText('BROWSER ONLY')
      await page.getByRole('button',{name:/Personnalisation/}).click()
      const settings=page.getByRole('dialog')
      await expect(settings.getByRole('heading',{name:'Python Engine · Accès universel'})).toBeVisible()
      await settings.getByRole('radio',{name:/Serveur institutionnel/}).check()
      await settings.getByRole('textbox',{name:'URL du moteur HTTPS'}).fill('https://science.example.org')
      await settings.getByRole('button',{name:'Connecter le moteur'}).click()
      await expect(page.locator('.status-pill')).toContainText('PYTHON CLOUD')
      await expect(settings.getByText('Cloud connecté')).toBeVisible()
      await expect(settings.getByText('MNE 1.9',{exact:false})).toBeVisible()
      await settings.getByRole('radio',{name:/Navigateur uniquement/}).check()
      await settings.getByRole('button',{name:'Connecter le moteur'}).click()
      await expect(page.locator('.status-pill')).toContainText('BROWSER ONLY')
      await expect(page.locator('.neuro-command-dashboard')).toBeVisible()
      if(isMobile)await expect(page.locator('.mobile-menu')).toBeVisible()
    })
})
