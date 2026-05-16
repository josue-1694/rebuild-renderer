const express   = require('express')
const puppeteer = require('puppeteer')
const { createClient } = require('@supabase/supabase-js')
const cors = require('cors')

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
  top: 0; bottom: 0;
  left: 60px; right: 60px;
  display: flex; flex-direction: column;
  justify-content: center;
  padding-top: 40px;
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
  font-size: 96px;
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
  background: ${barColor};
  color: #111827;
  font-size: 52px;
  font-weight: 900;
  padding: 28px 44px;
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
  ${slide.label ? `<div class="label">${slide.label}</div>` : ''}

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
    <div class="yellow-box" style="font-size:72px;text-align:center;">
      ¿Cuál es tu<br>riesgo metabólico?
    </div>
    <div class="headline" style="text-align:center;">
      Descúbrelo GRATIS<br>en 3 minutos. 🧬
    </div>
    <div class="cta-box">mynutritionworld.net</div>
    <div class="cta-sub">
      ${lang === 'es'
        ? 'Calcula tu perfil metabólico post-GLP-1'
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
  <span class="footer-name">DR. FRANK GARCÍA MD 🧬</span>
</div>

</body>
</html>`
}

app.listen(PORT, () => {
  console.log(`REBUILD Renderer running on port ${PORT}`)
})
