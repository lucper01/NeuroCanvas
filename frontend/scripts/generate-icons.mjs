import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'

await mkdir(new URL('../public/', import.meta.url), { recursive: true })
for (const size of [192, 512]) {
  await sharp(new URL('../public/icon.svg', import.meta.url))
    .resize(size, size)
    .png()
    .toFile(new URL('../public/icon-' + size + '.png', import.meta.url).pathname)
  console.log('Generated', size + '×' + size, 'PWA icon')
}
