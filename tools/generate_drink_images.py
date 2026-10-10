#!/usr/bin/env python3
"""
Generate MixologyVault drink photos from drink_image_prompts.json.

Every image is generated WITH the Old Fashioned photo as a style reference, so all
98 drinks share its look (dark bar, bokeh, crystal glassware, brass jigger).

Usage (from the repo root, e.g. C:\\...\\GIT_Repo\\MixologyVault):
  set OPENAI_API_KEY=sk-...          (or  set GEMINI_API_KEY=...)
  python tools\\generate_drink_images.py                    # all missing drinks
  python tools\\generate_drink_images.py --only french-75 godfather
  python tools\\generate_drink_images.py --limit 3          # test a few first
  python tools\\generate_drink_images.py --dry-run          # print what would run

Options:
  --provider openai|gemini   default: whichever key is set (OpenAI preferred)
  --model NAME               default: gpt-image-1 / gemini-2.5-flash-image
  --reference PATH           default: assets/img/old-fashioned.jpg
  --force                    regenerate even if assets/img/<id>.jpg exists
Outputs assets/img/<id>.jpg (800x800 JPEG if Pillow is installed) and writes
assets/img/_drink_photos_snippet.js with lines to paste into DRINK_PHOTOS in app.js.
Stdlib only; Pillow (pip install pillow) is optional but recommended for resizing.
"""
import argparse, base64, io, json, mimetypes, os, sys, time, uuid, urllib.request, urllib.error
from pathlib import Path

HERE = Path(__file__).resolve().parent

def find_repo_root():
    for p in [Path.cwd(), HERE, HERE.parent]:
        if (p / 'assets' / 'img').is_dir(): return p
    sys.exit('Run this from the MixologyVault repo root (folder containing assets/img).')

def http(req, timeout=300):
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r: return json.loads(r.read())
        except urllib.error.HTTPError as e:
            body = e.read().decode('utf-8', 'replace')[:500]
            if e.code in (429, 500, 502, 503) and attempt < 3:
                wait = 20 * (attempt + 1); print(f'   HTTP {e.code}, retrying in {wait}s'); time.sleep(wait); continue
            raise RuntimeError(f'HTTP {e.code}: {body}')
        except urllib.error.URLError as e:
            if attempt < 3: time.sleep(10); continue
            raise

def openai_generate(prompt, ref_bytes, ref_name, model, key):
    boundary = uuid.uuid4().hex
    fields = {'model': model, 'prompt': prompt, 'size': '1024x1024', 'n': '1', 'quality': 'high'}
    if model.startswith('gpt-image'):
        fields.update({'output_format': 'jpeg', 'output_compression': '85'})
    body = io.BytesIO()
    for k, v in fields.items():
        body.write(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    ctype = mimetypes.guess_type(ref_name)[0] or 'image/jpeg'
    body.write(f'--{boundary}\r\nContent-Disposition: form-data; name="image[]"; filename="{ref_name}"\r\nContent-Type: {ctype}\r\n\r\n'.encode())
    body.write(ref_bytes); body.write(f'\r\n--{boundary}--\r\n'.encode())
    req = urllib.request.Request('https://api.openai.com/v1/images/edits', data=body.getvalue(), method='POST',
        headers={'Authorization': f'Bearer {key}', 'Content-Type': f'multipart/form-data; boundary={boundary}'})
    res = http(req)
    return base64.b64decode(res['data'][0]['b64_json'])

def gemini_generate(prompt, ref_bytes, ref_name, model, key):
    ctype = mimetypes.guess_type(ref_name)[0] or 'image/jpeg'
    payload = {'contents': [{'parts': [
        {'text': 'Use the attached photo ONLY as the style, lighting, set and composition reference. '
                 'Create a NEW photo of a different drink as described below.\n\n' + prompt},
        {'inline_data': {'mime_type': ctype, 'data': base64.b64encode(ref_bytes).decode()}}]}],
        'generationConfig': {'responseModalities': ['IMAGE'], 'imageConfig': {'aspectRatio': '1:1'}}}
    url = f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent'
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), method='POST',
        headers={'Content-Type': 'application/json', 'x-goog-api-key': key})
    res = http(req)
    for part in res.get('candidates', [{}])[0].get('content', {}).get('parts', []):
        data = part.get('inline_data') or part.get('inlineData')
        if data: return base64.b64decode(data['data'])
    raise RuntimeError('No image returned: ' + json.dumps(res)[:400])

def save_jpeg(raw, dest, size=800):
    try:
        from PIL import Image
        im = Image.open(io.BytesIO(raw)).convert('RGB')
        im.thumbnail((size, size), Image.LANCZOS)
        im.save(dest, 'JPEG', quality=82, optimize=True, progressive=True)
    except ImportError:
        if raw[:3] != b'\xff\xd8\xff':
            dest = dest.with_suffix('.png'); print('   Pillow not installed -> saved as PNG; pip install pillow for JPEG')
        dest.write_bytes(raw)
    return dest

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--provider', choices=['openai', 'gemini'])
    ap.add_argument('--model'); ap.add_argument('--reference')
    ap.add_argument('--prompts', default=str(HERE / 'drink_image_prompts.json'))
    ap.add_argument('--only', nargs='*'); ap.add_argument('--limit', type=int)
    ap.add_argument('--force', action='store_true'); ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()

    root = find_repo_root(); img_dir = root / 'assets' / 'img'
    ref = Path(a.reference) if a.reference else img_dir / 'old-fashioned.jpg'
    if not ref.exists(): sys.exit(f'Reference image not found: {ref}')
    drinks = json.load(open(a.prompts, encoding='utf-8'))
    if a.only: drinks = [d for d in drinks if d['id'] in a.only]
    todo = [d for d in drinks if a.force or not (img_dir / f"{d['id']}.jpg").exists()]
    if a.limit: todo = todo[:a.limit]

    provider = a.provider or ('openai' if os.getenv('OPENAI_API_KEY') else 'gemini' if os.getenv('GEMINI_API_KEY') else None)
    print(f'{len(todo)} to generate (of {len(drinks)}), reference: {ref.name}, provider: {provider}')
    if a.dry_run:
        for d in todo: print(' -', d['id'])
        return
    if not provider: sys.exit('Set OPENAI_API_KEY or GEMINI_API_KEY first.')
    key = os.getenv('OPENAI_API_KEY' if provider == 'openai' else 'GEMINI_API_KEY')
    model = a.model or ('gpt-image-1' if provider == 'openai' else 'gemini-2.5-flash-image')
    gen = openai_generate if provider == 'openai' else gemini_generate
    ref_bytes = ref.read_bytes()

    done, failed = [], []
    for n, d in enumerate(todo, 1):
        print(f'[{n}/{len(todo)}] {d["id"]}', flush=True)
        try:
            raw = gen(d['prompt'], ref_bytes, ref.name, model, key)
            out = save_jpeg(raw, img_dir / f"{d['id']}.jpg")
            print(f'   saved {out.name} ({out.stat().st_size // 1024} KB)'); done.append(d)
        except Exception as e:
            print(f'   FAILED: {e}'); failed.append(d['id'])

    have = [d for d in json.load(open(a.prompts, encoding='utf-8')) if (img_dir / f"{d['id']}.jpg").exists()]
    snippet = img_dir / '_drink_photos_snippet.js'
    snippet.write_text('// Paste inside DRINK_PHOTOS in app.js\n' +
        '\n'.join(f"  '{d['id']}': 'assets/img/{d['id']}.jpg'," for d in have) + '\n', encoding='utf-8')
    print(f'\nDone: {len(done)} generated, {len(failed)} failed. DRINK_PHOTOS lines -> {snippet}')
    if failed: print('Re-run to retry failed:', ' '.join(failed))

if __name__ == '__main__':
    main()
