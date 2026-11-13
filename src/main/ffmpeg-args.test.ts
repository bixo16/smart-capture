import test from 'node:test'
import assert from 'node:assert/strict'
import { concatList, evenRegion, parseDshowAudio, recordArgs, screenshotArgs, trimArgs } from './ffmpeg-args.ts'

test('screenshot grabs only the region', () => {
  const a = screenshotArgs({ x: 1500, y: 800, width: 400, height: 270 }, 'o.png', 'png')
  assert.deepEqual(a.slice(a.indexOf('-offset_x'), a.indexOf('-i') + 2),
    ['-offset_x', '1500', '-offset_y', '800', '-video_size', '400x270', '-i', 'desktop'])
})

test('even region shaves odd pixel, keeps origin', () => {
  assert.deepEqual(evenRegion({ x: -1920, y: 3, width: 641, height: 361 }), { x: -1920, y: 3, width: 640, height: 360 })
})

test('record args: limit, fps, audio, codec', () => {
  const a = recordArgs({ region: { x: 0, y: 0, width: 101, height: 100 }, fps: 60, format: 'webm', quality: 'high',
    audioDevice: 'Mistura estéreo (Realtek(R) Audio)', durationSec: 12.5, out: 'x.webm' })
  assert.equal(a[a.indexOf('-framerate') + 1], '60')
  assert.equal(a[a.indexOf('-video_size') + 1], '100x100')
  assert.equal(a[a.indexOf('-t') + 1], '12.500')
  assert.ok(a.includes('audio=Mistura estéreo (Realtek(R) Audio)'))
  assert.ok(a.includes('libvpx-vp9') && a.includes('libopus'))
  const b = recordArgs({ region: { x: 0, y: 0, width: 10, height: 10 }, fps: 30, format: 'mp4', quality: 'low',
    audioDevice: null, durationSec: null, out: 'x.mp4' })
  assert.ok(!b.includes('-t') && !b.includes('dshow') && b.includes('libx264'))
})

test('trim seeks to start and keeps only the selected length', () => {
  const a = trimArgs('in.mp4', 1.25, 4, 'out.mp4', 'mp4', 'high')
  assert.equal(a[a.indexOf('-ss') + 1], '1.250')
  assert.ok(a.indexOf('-ss') < a.indexOf('-i'))
  assert.equal(a[a.indexOf('-t') + 1], '2.750')
  assert.equal(a.at(-1), 'out.mp4')
})

test('concat list escapes quotes', () => {
  assert.equal(concatList(["C:\\a\\it's.mp4"]), "file 'C:/a/it'\\''s.mp4'\n")
})

test('parse dshow audio devices', () => {
  const s = `[dshow @ 0] "HP Camera" (video)\n[dshow @ 0] "Mistura estéreo (Realtek(R) Audio)" (audio)\n[dshow @ 0]   Alternative name "@device_cm_x"\n[dshow @ 0] "Microfone (DroidCam Audio)" (audio)`
  assert.deepEqual(parseDshowAudio(s), ['Mistura estéreo (Realtek(R) Audio)', 'Microfone (DroidCam Audio)'])
})
