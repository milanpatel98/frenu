import json, re, sys
e = json.load(open('/home/claude/roadword/i18n/en.json'))
for f in sys.argv[1:]:
    t = json.load(open(f))
    assert set(e['ui']) == set(t['ui']), ('ui', set(e['ui']) ^ set(t['ui']))
    assert set(e['phrases']) == set(t['phrases']), ('phrases', set(e['phrases']) ^ set(t['phrases']))
    assert 'say' in t and set(t['say']) == set(e['phrases']), ('say', set(e['phrases']) ^ set(t.get('say', {})))
    for k in e['ui']:
        a, b = set(re.findall(r'\{\w+\}', e['ui'][k])), set(re.findall(r'\{\w+\}', t['ui'][k]))
        assert a == b, ('placeholder', k)
    for sec in ('ui', 'phrases', 'say'):
        for k, v in t[sec].items():
            assert isinstance(v, str) and v.strip(), ('empty', sec, k)
    print(f, 'ok')
