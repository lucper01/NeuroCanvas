import { afterEach, describe, expect, it, vi } from 'vitest'
import { connectEngine, disconnectEngine, downloadFromEngine, engineEndpoints,
  normalizeEngineURL, api } from './api'

const response=(status:number, body:unknown)=>new Response(JSON.stringify(body),{
  status,headers:{'Content-Type':'application/json'}
})

describe('Universal Python Engine Client',()=>{
  afterEach(()=>{vi.unstubAllGlobals();disconnectEngine()})
  it('accepts HTTPS cloud APIs and loopback development addresses only',()=>{
    expect(normalizeEngineURL('https://python.example.org')).toBe('https://python.example.org/api')
    expect(normalizeEngineURL('https://python.example.org/api')).toBe('https://python.example.org/api')
    expect(normalizeEngineURL('http://127.0.0.1:8000')).toBe('http://127.0.0.1:8000/api')
    expect(()=>normalizeEngineURL('http://python.example.org')).toThrow(/HTTPS/)
    expect(()=>normalizeEngineURL('https://evil.example.org?token=bad')).toThrow()
    expect(()=>normalizeEngineURL('https://user:pw@python.example.org')).toThrow()
    expect(()=>normalizeEngineURL('javascript:alert(1)')).toThrow()
  })

  it('requests short-lived guest authorization and attaches it to every scientific request',async()=>{
    const requests:{url:string;auth:string|null}[]=[]
    vi.stubGlobal('fetch',vi.fn(async(uri:string,init?:RequestInit)=>{
      const url=String(uri),headers=new Headers(init?.headers)
      requests.push({url,auth:headers.get('Authorization')})
      if(url.endsWith('/api/health'))return response(200,{
        status:'ok',engine:'Python / SciPy',mne:'1.9',neurokit2:'0.2',mode:'shared',auth:'guest'
      })
      if(url.endsWith('/api/access/guest'))return response(200,{token:'signed_guest_token',expires_in:7200})
      if(url.endsWith('/api/demo'))return response(200,{session_id:'abc',channels:[]})
      throw Error(url)
    }))
    const info=await connectEngine('https://scientific.example.org')
    expect(info.mode).toBe('shared')
    expect(engineEndpoints.connectedToGuest).toBe(true)
    await api.demo()
    expect(requests[0].auth).toBeNull()
    expect(requests[1].auth).toBeNull()
    expect(requests[2].auth).toBe('Bearer signed_guest_token')
    expect(engineEndpoints.current).toBe('https://scientific.example.org/api')
  })

  it('keeps original engine connection if a new endpoint is unreachable',async()=>{
    let fail=false
    vi.stubGlobal('fetch',vi.fn(async()=>{
      if(fail)throw Error('Host unavailable')
      return response(200,{status:'ok',engine:'Python / SciPy',mode:'local',auth:'none'})
    }))
    await connectEngine('http://127.0.0.1:8000')
    fail=true
    await expect(connectEngine('https://not-available.example.org')).rejects.toThrow()
    expect(engineEndpoints.current).toBe('http://127.0.0.1:8000/api')
  })

  it('fails closed if remote engine needs unsupported authentication',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>response(200,{
      status:'ok',engine:'Python',auth:'unknown'
    })))
    await expect(connectEngine('https://server.example.org')).rejects.toThrow(/authentication/)
  })

  it('sends bearer authorization when retrieving scientific exports',async()=>{
    const signed=vi.fn(async(uri:string,init?:RequestInit)=>{
      if(String(uri).endsWith('/health'))return response(200,{status:'ok',engine:'Python',auth:'guest'})
      if(String(uri).endsWith('/guest'))return response(200,{token:'signed_guest'})
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer signed_guest')
      return new Response('onset_s,code\n0.5,11',{status:200})
    })
    vi.stubGlobal('fetch',signed)
    vi.stubGlobal('URL',{...URL,createObjectURL:()=> 'blob:example',revokeObjectURL:()=>{}})
    // Do not initiate a synthetic click in unit tests; network/header integrity
    // is exercised through a fetch on the signed export route.
    await connectEngine('https://science.example.org')
    const result=await api.triggerEvents('session-one')
    expect(result).toBeDefined()
  })
})
