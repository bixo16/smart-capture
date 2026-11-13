// Pure ffmpeg argument builders (no Electron imports, so they can be unit-tested with plain node).

/** Region in physical screen pixels (virtual-desktop coordinates). */
export interface Region {
  x: number
  y: number
  width: number
  height: number
}

export interface RecordOptions {
  region: Region
  fps: 30 | 60
  format: 'mp4' | 'webm'
  quality: 'high' | 'medium' | 'low'
  audioDevice: string | null
  /** null = until stopped */
  durationSec: number | null
  out: string
}

const CRF = {
  mp4: { high: 18, medium: 23, low: 28 },
  webm: { high: 24, medium: 32, low: 40 }
}

/** gdigrab input that grabs ONLY the given rectangle via BitBlt — never the full screen. */
function regionInput(r: Region, fps?: number): string[] {
  return [
    '-f', 'gdigrab',
    ...(fps ? ['-framerate', String(fps)] : []),
    '-offset_x', String(Math.round(r.x)),
    '-offset_y', String(Math.round(r.y)),
    '-video_size', `${Math.round(r.width)}x${Math.round(r.height)}`,
    '-i', 'desktop'
  ]
}

export function screenshotArgs(r: Region, out: string, format: 'png' | 'jpg'): string[] {
  return [
    '-hide_banner', '-loglevel', 'error', '-y',
    ...regionInput(r),
    '-frames:v', '1',
    ...(format === 'jpg' ? ['-q:v', '2', '-pix_fmt', 'yuvj444p'] : []),
    out
  ]
}

/** yuv420p needs even dimensions; shave at most 1px instead of scaling. */
export function evenRegion(r: Region): Region {
  const width = Math.max(2, Math.round(r.width) & ~1)
  const height = Math.max(2, Math.round(r.height) & ~1)
  return { x: Math.round(r.x), y: Math.round(r.y), width, height }
}

export function recordArgs(o: RecordOptions): string[] {
  const args = ['-hide_banner', '-y', '-thread_queue_size', '1024', '-draw_mouse', '1', '-show_region', '1',
    ...regionInput(evenRegion(o.region), o.fps)]
  if (o.audioDevice) args.push('-thread_queue_size', '1024', '-f', 'dshow', '-i', `audio=${o.audioDevice}`)
  if (o.durationSec !== null) args.push('-t', o.durationSec.toFixed(3))
  args.push(...encodeArgs(o.format, o.quality, !!o.audioDevice), '-r', String(o.fps), o.out)
  return args
}

function encodeArgs(format: 'mp4' | 'webm', quality: 'high' | 'medium' | 'low', audio: boolean): string[] {
  const crf = String(CRF[format][quality])
  if (format === 'mp4') {
    return ['-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-crf', crf, '-pix_fmt', 'yuv420p',
      ...(audio ? ['-c:a', 'aac', '-b:a', '160k'] : []), '-movflags', '+faststart']
  }
  return ['-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-row-mt', '1', '-b:v', '0', '-crf', crf,
    '-pix_fmt', 'yuv420p', ...(audio ? ['-c:a', 'libopus', '-b:a', '128k'] : [])]
}

/** Frame-accurate trim: re-encodes (stream copy could only cut on keyframes, seconds apart). */
export function trimArgs(input: string, startSec: number, endSec: number, out: string,
  format: 'mp4' | 'webm', quality: 'high' | 'medium' | 'low'): string[] {
  return ['-hide_banner', '-loglevel', 'error', '-y', '-ss', startSec.toFixed(3), '-i', input,
    '-t', (endSec - startSec).toFixed(3), ...encodeArgs(format, quality, true), out]
}

/** Joins pause/resume segments without re-encoding. */
export function concatArgs(listFile: string, out: string, format: 'mp4' | 'webm'): string[] {
  return ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy',
    ...(format === 'mp4' ? ['-movflags', '+faststart'] : []), out]
}

export function concatList(files: string[]): string {
  return files.map((f) => `file '${f.replace(/\\/g, '/').replace(/'/g, `'\\''`)}'`).join('\n') + '\n'
}

/** Parses `ffmpeg -list_devices true -f dshow -i dummy` output into audio device names. */
export function parseDshowAudio(stderr: string): string[] {
  const out: string[] = []
  for (const m of stderr.matchAll(/"([^"]+)"\s+\(audio\)/g)) out.push(m[1])
  return out
}
