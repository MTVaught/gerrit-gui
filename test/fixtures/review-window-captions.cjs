// Repaint only the reserved caption strip. Preserve captured actions and timing.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

function finishCaptions(video, captions) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'review-caption-'))
  try {
    const start = captions[0].seconds
    const filters = ['drawbox=x=0:y=980:w=1920:h=100:color=0x132135:t=fill']
    captions.forEach((caption, index) => {
      const file = path.join(temporary, `caption-${index}.txt`)
      fs.writeFileSync(file, caption.text)
      const from = Math.max(0, caption.seconds - start)
      const to = index + 1 < captions.length ? captions[index + 1].seconds - start : 9999
      filters.push(`drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:textfile=${file}:fontcolor=white:fontsize=23:x=28:y=1000:enable='between(t,${from},${to})'`)
    })
    const result = path.join(temporary, 'captioned.mp4')
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', video, '-vf', filters.join(','), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', result], { stdio: 'inherit' })
    fs.copyFileSync(result, video)
  } finally { fs.rmSync(temporary, { recursive: true, force: true }) }
}
module.exports = { finishCaptions }
