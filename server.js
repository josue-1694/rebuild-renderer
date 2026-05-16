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
  const isCTA      = slideNum === totalSlides
  const titleLen   = (slide.title || '').length
  const titleSize  = titleLen > 80 ? '48px' : titleLen > 50 ? '58px' : '68px'

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
    font-family: 'Montserrat', Arial, sans-serif;
    overflow: hidden;
    position: relative;
  }
  .bar { position: absolute; left: 0; right: 0; height: 8px; background: ${barColor}; }
  .bar-top { top: 0; }
  .bar-bottom { bottom: 0; }
  .slide-num {
    position: absolute; top: 28px; right: 48px;
    color: rgba(255,255,255,0.25);
    font-size: 22px; font-weight: 700;
  }
  .content {
    position: absolute;
    top: 60px; bottom: 60px;
    left: 72px; right: 72px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    gap: 28px;
  }
  .label {
    color: ${barColor};
    font-size: 26px; font-weight: 900;
    letter-spacing: 4px;
    text-transform: uppercase;
    opacity: 0.85;
  }
  .stat {
    color: ${barColor};
    font-size: 140px; font-weight: 900;
    line-height: 0.9;
  }
  .title {
    color: #ffffff;
    font-size: ${titleSize};
    font-weight: 900;
    line-height: 1.15;
  }
  .body-text {
    color: #d1d5db;
    font-size: 36px; font-weight: 400;
    line-height: 1.65;
    max-width: 920px;
  }
  .cta-box {
    background: ${barColor};
    color: #111827;
    font-size: 38px; font-weight: 900;
    padding: 30px 60px;
    border-radius: 16px;
    letter-spacing: 1px;
  }
  .cta-sub {
    color: #9ca3af;
    font-size: 26px;
    font-weight: 400;
  }
  .rebuild-badge {
    color: ${barColor};
    font-size: 28px; font-weight: 900;
    letter-spacing: 6px;
    text-transform: uppercase;
    border: 2px solid ${barColor};
    padding: 8px 24px;
    border-radius: 8px;
  }
  .footer {
    position: absolute;
    bottom: 22px; left: 0; right: 0;
    text-align: center;
    color: #00B4CC;
    font-size: 22px; font-weight: 700;
    letter-spacing: 5px;
    text-transform: uppercase;
  }
</style>
</head>
<body>
  <div class="bar bar-top"></div>
  <div class="bar bar-bottom"></div>
  <div class="slide-num">${slideNum}/${totalSlides}</div>

  <div class="content">
    ${slide.label    ? `<div class="label">${slide.label}</div>` : ''}
    ${slideNum === 1 ? `<div class="rebuild-badge">REBUILD</div>` : ''}
    ${slide.stat     ? `<div class="stat">${slide.stat}</div>`   : ''}
    ${slide.title    ? `<div class="title">${slide.title}</div>` : ''}
    ${slide.body && !isCTA ? `<div class="body-text">${slide.body}</div>` : ''}
    ${isCTA ? `
      <div class="cta-box">mynutritionworld.net</div>
      <div class="cta-sub">
        ${lang === 'es'
          ? 'Calcula tu riesgo metabólico GRATIS'
          : 'Calculate your metabolic risk FREE'}
      </div>
    ` : ''}
  </div>

  <div class="footer">DR. FRANK GARCIA MD</div>
</body>
</html>`
}

app.listen(PORT, () => {
  console.log(`REBUILD Renderer running on port ${PORT}`)
})
