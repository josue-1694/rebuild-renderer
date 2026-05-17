const express              = require('express')
const puppeteer            = require('puppeteer')
const { createClient }     = require('@supabase/supabase-js')
const cors                 = require('cors')
const { execSync }         = require('child_process')
const fs                   = require('fs')
const path                 = require('path')
const os                   = require('os')

const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' }))

const PORT = process.env.PORT || 3001

const ws = require('ws')
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    realtime: {
      transport: ws,
    },
  }
)

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status:  'REBUILD Renderer active',
    version: '1.0.0',
    chrome:  process.env.PUPPETEER_EXECUTABLE_PATH || 'bundled',
  })
})

// ── Main render endpoint ──────────────────────────────────────────────────────
app.post('/render', async (req, res) => {
  const { slides, stage = 'post', lang = 'es', sessionId } = req.body

  if (!slides || !Array.isArray(slides) || slides.length === 0) {
    return res.status(400).json({ error: 'slides array required' })
  }

  const barColor =
    stage === 'pre'    ? '#D4FF00'
    : stage === 'during' ? '#00B4CC'
    : '#2D6A1F'

  const sid  = sessionId || Date.now().toString()
  const urls = []

  let browser
  try {
    browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
      ],
      headless: true,
    })

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i]
      const page  = await browser.newPage()
      await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 1 })

      const html = generateSlideHTML(slide, barColor, i + 1, slides.length, lang)
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15000 })
      await new Promise(r => setTimeout(r, 400))

      const buffer = await page.screenshot({
        type: 'png',
        clip: { x: 0, y: 0, width: 1080, height: 1350 },
      })
      await page.close()

      // Upload to Supabase Storage
      const filename = `carousel/${sid}/slide_${String(i + 1).padStart(2, '0')}.png`
      const { error: uploadErr } = await supabase.storage
        .from('content')
        .upload(filename, buffer, { contentType: 'image/png', upsert: true })

      if (uploadErr) throw new Error(`Supabase upload: ${uploadErr.message}`)

      const { data: { publicUrl } } = supabase.storage
        .from('content')
        .getPublicUrl(filename)

      urls.push(publicUrl)
      console.log(`✅ Slide ${i + 1}/${slides.length} → ${publicUrl}`)
    }

    await browser.close()
    browser = null

    res.json({ success: true, urls, count: urls.length, sessionId: sid })
  } catch (err) {
    console.error('Render error:', err.message)
    if (browser) await browser.close().catch(() => {})
    res.status(500).json({ error: err.message })
  }
})

// ── Slide HTML generator ──────────────────────────────────────────────────────
function generateSlideHTML(slide, barColor, slideNum, totalSlides, lang) {
  const isPortada = slideNum === 1
  const isCTA = slideNum === totalSlides

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700;900&display=swap" rel="stylesheet">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  width: 1080px; height: 1350px;
  background: #111827;
  font-family: 'Montserrat', sans-serif;
  overflow: hidden;
  position: relative;
}
.bar-top { position: absolute; top: 0; left: 0; right: 0; height: 12px; background: ${barColor}; z-index: 99; }
.bar-bottom { position: absolute; bottom: 0; left: 0; right: 0; height: 12px; background: ${barColor}; z-index: 99; }
.header {
  position: absolute; top: 28px; left: 48px;
  display: flex; align-items: center; gap: 12px;
  z-index: 10;
}
.logo-box { width: 44px; height: 44px; }
.brand-text { display: flex; flex-direction: column; line-height: 1.1; }
.brand-rebuild { color: #ffffff; font-size: 15px; font-weight: 900; letter-spacing: 4px; }
.brand-protocol { color: #00B4CC; font-size: 9px; font-weight: 700; letter-spacing: 4px; }
.slide-num {
  position: absolute; top: 36px; right: 48px;
  color: rgba(255,255,255,0.2); font-size: 20px; font-weight: 700;
}
.content {
  position: absolute;
  top: 20px; bottom: 0;
  left: 60px; right: 60px;
  display: flex; flex-direction: column;
  justify-content: center;
  padding-top: 0px;
  gap: 32px;
}
.label {
  color: rgba(255,255,255,0.45);
  font-size: 30px; font-weight: 900;
  letter-spacing: 6px; text-transform: uppercase;
}
.yellow-box {
  background: #D4FF00;
  color: #111827;
  font-size: 110px;
  font-weight: 900;
  line-height: 1.05;
  padding: 28px 44px;
  border-radius: 32px;
  display: block;
  width: 100%;
}
.headline {
  color: #ffffff;
  font-size: 88px;
  font-weight: 900;
  line-height: 1.1;
}
.body-text {
  color: #d1d5db;
  font-size: 42px;
  font-weight: 400;
  line-height: 1.55;
}
.highlight { color: #D4FF00; font-weight: 900; }
.cta-box {
  background: #1a4a1a;
  border: 2px solid #2D6A1F;
  color: #D4FF00;
  font-size: 44px;
  font-weight: 900;
  padding: 24px 44px;
  border-radius: 32px;
  display: block;
  width: 100%;
  text-align: center;
}
.cta-sub {
  color: rgba(255,255,255,0.6);
  font-size: 36px;
  font-weight: 400;
  text-align: center;
}
.footer {
  position: absolute;
  bottom: 22px; left: 48px; right: 48px;
  display: flex; justify-content: space-between; align-items: center;
}
.footer-handle {
  color: rgba(255,255,255,0.4);
  font-size: 18px; font-weight: 600;
  display: flex; align-items: center; gap: 8px;
}
.footer-name {
  color: #00B4CC;
  font-size: 18px; font-weight: 700;
  letter-spacing: 1px;
}
</style>
</head>
<body>
<div class="bar-top"></div>
<div class="bar-bottom"></div>

<div class="header">
  <svg class="logo-box" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
    <rect width="200" height="200" rx="44" fill="#111827"/>
    <polygon points="100,22 145,47 145,97 100,122 55,97 55,47" fill="none" stroke="#2D6A1F" stroke-width="1.5"/>
    <circle cx="100" cy="22" r="3" fill="#D4FF00"/>
    <circle cx="145" cy="72" r="3" fill="#D4FF00" opacity="0.5"/>
    <circle cx="55" cy="72" r="3" fill="#D4FF00" opacity="0.5"/>
    <text x="100" y="108" font-family="Georgia,serif" font-size="88" font-weight="700" fill="#FFFFFF" text-anchor="middle">R</text>
    <line x1="62" y1="118" x2="138" y2="118" stroke="#D4FF00" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="100" cy="130" r="3" fill="#2D6A1F"/>
    <text x="100" y="158" font-family="Arial,sans-serif" font-size="18" font-weight="700" fill="#FFFFFF" text-anchor="middle" letter-spacing="4">REBUILD</text>
    <text x="100" y="174" font-family="Arial,sans-serif" font-size="8" fill="#00B4CC" text-anchor="middle" letter-spacing="3">PROTOCOL</text>
  </svg>
  <div class="brand-text">
    <span class="brand-rebuild">REBUILD</span>
    <span class="brand-protocol">PROTOCOL</span>
  </div>
</div>

<div class="slide-num">${slideNum}/${totalSlides}</div>

<div class="content">
  ${slide.label && slideNum < totalSlides ? `<div class="label">${slide.label}</div>` : ''}

  ${slide.stat
    ? `<div class="yellow-box">${slide.stat}</div>`
    : slide.title && isPortada
      ? `<div class="yellow-box">${slide.title}</div>`
      : slide.title
        ? `<div class="yellow-box" style="font-size:72px">${slide.title}</div>`
        : ''}

  ${slide.body ? `<div class="headline">${slide.body}</div>` : ''}

  ${slide.subtext ? `<div class="body-text">${slide.subtext}</div>` : ''}

  ${isCTA ? `
    <div class="yellow-box" style="font-size:68px;text-align:center;line-height:1.1;">
      ¿Cuál es tu<br>riesgo<br>metabólico?
    </div>
    <div class="headline" style="text-align:center;font-size:72px;">
      Descúbrelo GRATIS<br>en 3 minutos.
    </div>
    <div class="cta-box" style="font-size:44px;text-align:center;">
      mynutritionworld.net
    </div>
    <div class="cta-sub" style="text-align:center;font-size:32px;">
      ${lang === 'es'
        ? 'Calcula tu perfil metabolico post-GLP-1'
        : 'Calculate your post-GLP-1 metabolic profile'}
    </div>
  ` : ''}
</div>

<div class="footer">
  <span class="footer-handle">
    @dr.fgarcia
    <svg width="18" height="18" viewBox="0 0 24 24" fill="rgba(255,255,255,0.45)"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="rgba(255,255,255,0.45)"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.75a4.85 4.85 0 01-1.01-.06z"/></svg>
  </span>
  <span class="footer-name">DR. FRANK GARCIA MD</span>
</div>

</body>
</html>`
}

// ── Video processing: B-roll overlay + thumbnail generation ──────────────────
app.post('/process-video', async (req, res) => {
  const {
    videoUrl,
    videoName   = 'video.mp4',
    brollUrls   = [],
  } = req.body

  if (!videoUrl) return res.status(400).json({ error: 'videoUrl required' })

  const tmpDir       = fs.mkdtempSync(path.join(os.tmpdir(), 'rebuild-'))
  const mainVideo    = path.join(tmpDir, 'main.mp4')
  const thumbnailPath = path.join(tmpDir, 'thumbnail.jpg')

  try {
    // 1. Download main video
    console.log('Downloading main video:', videoUrl.substring(0, 80))
    execSync(`curl -L --max-time 120 -o "${mainVideo}" "${videoUrl}"`, { timeout: 130000 })

    // 2. Get duration
    const durationRaw = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${mainVideo}"`
    ).toString().trim()
    const duration = parseFloat(durationRaw) || 30
    console.log('Duration:', duration, 's')

    let finalVideo = mainVideo

    // 3. Add B-roll overlay (picture-in-picture, bottom-right, 5s each clip)
    if (brollUrls.length > 0) {
      console.log('Adding B-roll, clips:', brollUrls.length)
      const brollFiles = []

      for (let i = 0; i < Math.min(brollUrls.length, 3); i++) {
        const brollPath = path.join(tmpDir, 'broll_' + i + '.mp4')
        try {
          execSync(`curl -L --max-time 60 -o "${brollPath}" "${brollUrls[i]}"`, { timeout: 70000 })
          if (fs.existsSync(brollPath) && fs.statSync(brollPath).size > 1000) {
            brollFiles.push(brollPath)
            console.log('B-roll', i, 'downloaded')
          }
        } catch (e) {
          console.log('B-roll', i, 'download failed:', e.message.substring(0, 60))
        }
      }

      if (brollFiles.length > 0) {
        const brollOutput = path.join(tmpDir, 'with_broll.mp4')
        const inputs = brollFiles.map(f => `-i "${f}"`).join(' ')

        // Build filter: scale each broll to 320x180, overlay bottom-right for 5s windows
        const scaleFilters = brollFiles.map((f, i) =>
          `[${i + 1}:v]scale=320:180,setpts=PTS-STARTPTS[broll${i}]`
        ).join(';')

        let overlayChain = '[0:v]'
        const overlayParts = brollFiles.map((f, i) => {
          const start = i * 5
          const end   = start + 5
          const out   = i < brollFiles.length - 1 ? `[tmp${i}]` : '[vout]'
          const part  = `[broll${i}]overlay=W-330:H-190:enable='between(t,${start},${end})'${out}`
          const prev  = i === 0 ? overlayChain : `[tmp${i - 1}]`
          return `${prev}${part}`
        })

        // Rebuild as proper filtergraph
        const filterParts = [scaleFilters]
        let chain = '[0:v]'
        brollFiles.forEach((f, i) => {
          const start = i * 5
          const end   = start + 5
          const inTag = i === 0 ? '[0:v]' : `[vtmp${i - 1}]`
          const outTag = i < brollFiles.length - 1 ? `[vtmp${i}]` : '[vfinal]'
          filterParts.push(`${inTag}[broll${i}]overlay=W-330:H-190:enable='between(t,${start},${end})'${outTag}`)
        })

        const filterComplex = brollFiles.map((f, i) =>
          `[${i + 1}:v]scale=320:180,setpts=PTS-STARTPTS[broll${i}]`
        ).join(';') + ';' + (() => {
          let graph = ''
          brollFiles.forEach((f, i) => {
            const start  = i * 5
            const end    = start + 5
            const inTag  = i === 0 ? '[0:v]' : `[vtmp${i - 1}]`
            const outTag = i < brollFiles.length - 1 ? `[vtmp${i}]` : '[vfinal]'
            graph += `${inTag}[broll${i}]overlay=W-330:H-190:enable='between(t,${start},${end})'${outTag};`
          })
          return graph.replace(/;$/, '')
        })()

        try {
          execSync(
            `ffmpeg -y -i "${mainVideo}" ${inputs} ` +
            `-filter_complex "${filterComplex}" ` +
            `-map "[vfinal]" -map 0:a -c:v libx264 -preset fast -crf 23 -c:a aac -shortest "${brollOutput}"`,
            { timeout: 180000 }
          )
          if (fs.existsSync(brollOutput) && fs.statSync(brollOutput).size > 1000) {
            finalVideo = brollOutput
            console.log('B-roll overlay applied')
          }
        } catch (e) {
          console.log('B-roll overlay failed, using original. Error:', e.message.substring(0, 120))
        }
      }
    }

    // 4. Generate thumbnail at 1s mark (portrait 1080x1920)
    console.log('Generating thumbnail...')
    try {
      execSync(
        `ffmpeg -y -i "${finalVideo}" -ss 00:00:01 -vframes 1 -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2" "${thumbnailPath}"`,
        { timeout: 30000 }
      )
    } catch (e) {
      // Fallback: any frame
      execSync(`ffmpeg -y -i "${finalVideo}" -vframes 1 "${thumbnailPath}"`, { timeout: 15000 })
    }

    // 5. Upload to Supabase
    const videoBuffer = fs.readFileSync(finalVideo)
    const thumbBuffer = fs.existsSync(thumbnailPath) ? fs.readFileSync(thumbnailPath) : null

    const safeVideoName = videoName.replace(/[^a-zA-Z0-9._-]/g, '_')
    const ts            = Date.now()
    const videoFilename = `videos/${ts}_${safeVideoName}`
    const thumbFilename = `thumbnails/${ts}_thumb.jpg`

    const { error: videoErr } = await supabase.storage
      .from('content')
      .upload(videoFilename, videoBuffer, { contentType: 'video/mp4', upsert: true })
    if (videoErr) throw new Error('Video upload: ' + videoErr.message)

    let thumbPublicUrl = null
    if (thumbBuffer) {
      const { error: thumbErr } = await supabase.storage
        .from('content')
        .upload(thumbFilename, thumbBuffer, { contentType: 'image/jpeg', upsert: true })
      if (!thumbErr) {
        thumbPublicUrl = supabase.storage.from('content').getPublicUrl(thumbFilename).data.publicUrl
      }
    }

    const videoPublicUrl = supabase.storage.from('content').getPublicUrl(videoFilename).data.publicUrl
    console.log('Done:', videoPublicUrl)

    res.json({ success: true, videoUrl: videoPublicUrl, thumbnailUrl: thumbPublicUrl, duration })

  } catch (err) {
    console.error('process-video error:', err.message)
    res.status(500).json({ error: err.message })
  } finally {
    try { execSync(`rm -rf "${tmpDir}"`) } catch (_) {}
  }
})

// ── /submit-mirage ─────────────────────────────────────────────────────────
// Downloads a video and uploads it to Mirage as multipart/form-data.
// Called by Vercel (which has a shorter timeout) — Railway has no timeout limits.
app.post('/submit-mirage', async (req, res) => {
  const { videoUrl, templateId, mirageKey } = req.body
  if (!videoUrl || !templateId || !mirageKey) {
    return res.status(400).json({ error: 'videoUrl, templateId, mirageKey required' })
  }

  try {
    const https    = require('https')
    const http     = require('http')
    const FormData = require('form-data')
    const fetch    = require('node-fetch')

    console.log('[submit-mirage] Downloading:', videoUrl.substring(0, 80))

    // Recursive download with redirect support
    const downloadVideo = (url, redirects = 0) => new Promise((resolve, reject) => {
      if (redirects > 5) return reject(new Error('Too many redirects'))
      const chunks   = []
      const protocol = url.startsWith('https') ? https : http
      const request  = protocol.get(url, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          return downloadVideo(response.headers.location, redirects + 1)
            .then(resolve).catch(reject)
        }
        if (response.statusCode !== 200) {
          return reject(new Error('Download failed: ' + response.statusCode))
        }
        response.on('data', chunk => chunks.push(chunk))
        response.on('end',  () => resolve(Buffer.concat(chunks)))
        response.on('error', reject)
      })
      request.on('error', reject)
      request.setTimeout(120000, () => { request.destroy(); reject(new Error('Download timeout')) })
    })

    const videoBuffer = await downloadVideo(videoUrl)
    console.log('[submit-mirage] Downloaded:', videoBuffer.length, 'bytes')

    const form = new FormData()
    form.append('caption_template_id', templateId)
    form.append('video', videoBuffer, { filename: 'video.mp4', contentType: 'video/mp4' })

    const mirageRes = await fetch('https://api.mirage.app/v1/videos/captions', {
      method:  'POST',
      headers: { 'x-api-key': mirageKey, ...form.getHeaders() },
      body:    form,
      timeout: 120000,
    })

    const data = await mirageRes.json()
    console.log('[submit-mirage] Mirage response [' + mirageRes.status + ']:', JSON.stringify(data).substring(0, 200))

    res.json({
      success: !data.error,
      jobId:   data?.id || null,
      error:   data?.error || null,
    })

  } catch (e) {
    console.error('[submit-mirage] error:', e.message)
    res.status(500).json({ error: e.message })
  }
})

app.listen(PORT, () => {
  console.log(`REBUILD Renderer running on port ${PORT}`)
})
