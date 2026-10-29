import json, os, subprocess, soundfile as sf
from kokoro_onnx import Kokoro
k = Kokoro("kokoro-v1.0.onnx", "voices-v1.0.bin")
en = json.load(open('i18n/en.json'))['phrases']
VOICES = {'w1':'af_heart','w2':'af_bella','m1':'am_michael','m2':'am_fenrir'}
out = 'audio'
done = 0
for short, v in VOICES.items():
    os.makedirs(f'{out}/{short}', exist_ok=True)
    for pid, text in en.items():
        mp3 = f'{out}/{short}/{pid}.mp3'
        if os.path.exists(mp3): continue
        s, sr = k.create(text, voice=v, speed=0.98, lang='en-us')
        wav = f'/tmp/{short}_{pid}.wav'; sf.write(wav, s, sr)
        subprocess.run(['ffmpeg','-y','-loglevel','error','-i',wav,'-af','silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,apad=pad_dur=0.12','-ac','1','-ar','24000','-b:a','48k',mp3], check=True)
        os.remove(wav); done += 1
        if done % 20 == 0: print(done, flush=True)
print('ALL DONE', done, flush=True)
