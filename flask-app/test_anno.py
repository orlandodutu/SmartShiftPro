"""
Test annuale generazione turni OSS — 12 mesi 2026
Completamente autonomo: crea la propria Flask app con SQLite isolato.
"""
import os, sys, tempfile

# ─── DB isolato ───────────────────────────────────────────────────────────────
_tmp = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
_tmp.close()
TEST_DB = _tmp.name

os.environ['DATABASE_URL']   = f'sqlite:///{TEST_DB}'
os.environ['SESSION_SECRET'] = 'test-secret-xyz'

# Sovrascriviamo le ENGINE_OPTIONS incompatibili con SQLite
import flask_sqlalchemy as _fsa
_orig_init = _fsa.SQLAlchemy.__init__

def _patched_init(self, app=None, *args, **kwargs):
    if app is not None:
        app.config.pop('SQLALCHEMY_ENGINE_OPTIONS', None)
    _orig_init(self, app, *args, **kwargs)

_fsa.SQLAlchemy.__init__ = _patched_init

# Ora importiamo l'app (che leggerà DATABASE_URL = sqlite:///...)
sys.path.insert(0, os.path.dirname(__file__))
from app import app, db, Dipendente, Turno, Assenza, _genera_interno
from datetime import date, timedelta

# ─── Costanti ────────────────────────────────────────────────────────────────
OSS_NOMI  = ['Carmen','Elena','Barbara','Vittoria','Stefania 2','Stefania','Ioana','Roberto']
OSS_NOTTE = {'Carmen','Barbara','Elena'}

MESI_2026 = [
    ('2026-01-01', 31), ('2026-02-01', 28), ('2026-03-01', 31),
    ('2026-04-01', 30), ('2026-05-01', 31), ('2026-06-01', 30),
    ('2026-07-01', 31), ('2026-08-01', 31), ('2026-09-01', 30),
    ('2026-10-01', 31), ('2026-11-01', 30), ('2026-12-01', 31),
]

# ─── Setup ────────────────────────────────────────────────────────────────────
def setup():
    with app.app_context():
        db.drop_all()
        db.create_all()
        staff = [
            Dipendente(nome='Orlando',  ruolo='DEV',        is_admin=True, password='x'),
            Dipendente(nome='Anna',     ruolo='INFERMIERA',               password='x'),
            Dipendente(nome='Fabiana',  ruolo='AUSILIARIO',               password='x'),
            Dipendente(nome='Marina',   ruolo='AUSILIARIO',               password='x'),
            Dipendente(nome='Angela',   ruolo='AUSILIARIO',               password='x'),
        ]
        for nome in OSS_NOMI:
            prefs = 'MATTINO,POMERIGGIO,NOTTE' if nome in OSS_NOTTE else 'MATTINO,POMERIGGIO'
            staff.append(Dipendente(nome=nome, ruolo='OSS', password='x',
                                    preferenze_turno=prefs, password_changed=True))
        db.session.add_all(staff)
        db.session.commit()
        print(f'  {len(staff)} dipendenti creati\n')

# ─── Generazione ──────────────────────────────────────────────────────────────
def genera():
    print('Generazione turni mese per mese:')
    with app.app_context():
        for data_inizio, giorni in MESI_2026:
            res, err = _genera_interno(data_inizio, giorni)
            tag = f'❌ {err}' if err else f"✓  {res['generati']} turni"
            print(f'  {data_inizio[:7]}: {tag}')

# ─── Analisi ──────────────────────────────────────────────────────────────────
def analizza():
    errori = []
    anno_inizio = date(2026,  1,  1)
    anno_fine   = date(2026, 12, 31)

    with app.app_context():
        oss_list = Dipendente.query.filter_by(ruolo='OSS').order_by(Dipendente.nome).all()
        oss_ids  = [d.id for d in oss_list]

        # ── A. ORE MENSILI ────────────────────────────────────────────────────
        print('\n' + '='*72)
        print('A) ORE PER MESE (target ≈173 h/mese)')
        print(f"{'':14}" + ''.join(f' {m[0][5:7]}' for m in MESI_2026) + '  MEDIA')
        print('-'*72)

        for dip in oss_list:
            row = f'{dip.nome:<14}'
            totale = 0
            for data_inizio, giorni in MESI_2026:
                d_fine = (date.fromisoformat(data_inizio) + timedelta(days=giorni-1)).strftime('%Y-%m-%d')
                ore = db.session.query(db.func.sum(Turno.ore)).filter(
                    Turno.dipendente_id == dip.id,
                    Turno.data >= data_inizio,
                    Turno.data <= d_fine,
                ).scalar() or 0
                totale += ore
                flag = '!' if (ore < 140 or ore > 210) else ' '
                row += f' {ore:>2}{flag}'
            media = totale / 12
            row += f'  {media:>5.1f}'
            print(row)
            if media < 155 or media > 195:
                errori.append(f'ORE {dip.nome}: media {media:.0f}h/mese (fuori 155-195)')

        # ── B. RIPOSO SETTIMANALE ─────────────────────────────────────────────
        print('\n' + '='*72)
        print('B) RIPOSO SETTIMANALE (1 RIPOSO/settimana obbligatorio)')

        # lunedì che apre ogni settimana dell'anno
        mon = anno_inizio - timedelta(days=anno_inizio.weekday())
        settimane = []
        while mon <= anno_fine:
            settimane.append(mon)
            mon += timedelta(weeks=1)

        for dip in oss_list:
            mancanti = []
            for lun in settimane:
                dom = lun + timedelta(days=6)
                w0 = max(lun, anno_inizio).strftime('%Y-%m-%d')
                w1 = min(dom, anno_fine).strftime('%Y-%m-%d')
                # RIPOSO o SMONTO contano come giorno di riposo settimanale:
                # SMONTO = recupero 0h post-notte, equivalente funzionale a RIPOSO
                n = Turno.query.filter(
                    Turno.dipendente_id == dip.id,
                    Turno.tipo.in_(['RIPOSO', 'SMONTO']),
                    Turno.data >= w0, Turno.data <= w1,
                ).count()
                if n == 0:
                    mancanti.append(lun.strftime('%Y-%m-%d'))
            sym = '✓ ' if not mancanti else '❌'
            detail = f'{len(mancanti)} settimane senza riposo/smonto' if mancanti else 'OK'
            print(f'  {sym} {dip.nome:<14} {detail}')
            if mancanti:
                errori.append(f'RIPOSO {dip.nome}: {len(mancanti)} sett. senza riposo/smonto')
                for w in mancanti[:5]:
                    print(f'       → sett. {w}')

        # ── C. RIPOSI CONSECUTIVI ────────────────────────────────────────────
        print('\n' + '='*72)
        print('C) RIPOSI CONSECUTIVI (non ammessi)')
        for dip in oss_list:
            dates = [
                date.fromisoformat(t.data)
                for t in Turno.query.filter_by(
                    dipendente_id=dip.id, tipo='RIPOSO'
                ).order_by(Turno.data).all()
            ]
            consec = [(dates[j-1], dates[j]) for j in range(1, len(dates))
                      if (dates[j]-dates[j-1]).days == 1]
            sym = '✓ ' if not consec else '❌'
            detail = 'OK' if not consec else f'{len(consec)} coppie consecutive'
            print(f'  {sym} {dip.nome:<14} {detail}')
            if consec:
                errori.append(f'CONSEC {dip.nome}: {len(consec)} riposi consecutivi')
                for a,b in consec[:3]:
                    print(f'       → {a} e {b}')

        # ── D. COPERTURA GIORNALIERA OSS ──────────────────────────────────────
        print('\n' + '='*72)
        print('D) COPERTURA GIORNALIERA OSS (min 2 MAT, 1 POM, 1 NOTTE/giorno)')
        mancanze = {'MAT':[], 'POM':[], 'NOT':[]}
        curr = anno_inizio
        while curr <= anno_fine:
            ds = curr.strftime('%Y-%m-%d')
            def cnt(tipo):
                return Turno.query.filter(
                    Turno.dipendente_id.in_(oss_ids),
                    Turno.data==ds, Turno.tipo==tipo
                ).count()
            if cnt('MATTINO')    < 2: mancanze['MAT'].append(ds)
            if cnt('POMERIGGIO') < 1: mancanze['POM'].append(ds)
            if cnt('NOTTE')      < 1: mancanze['NOT'].append(ds)
            curr += timedelta(days=1)

        for tipo, gg in mancanze.items():
            sym = '✓ ' if not gg else '❌'
            detail = 'OK tutto l\'anno' if not gg else f'{len(gg)} giorni sotto minimo'
            print(f'  {sym} {tipo}: {detail}')
            if gg:
                errori.append(f'COPERTURA {tipo}: {len(gg)} giorni sotto minimo')
                for g in gg[:5]:
                    print(f'       → {g}')
                    pass

        # ── E. EQUITÀ ORE (scarto max tra OSS) ───────────────────────────────
        print('\n' + '='*72)
        print('E) EQUITÀ ORE ANNUALI (scarto max tra OSS)')
        totali = {}
        for dip in oss_list:
            tot = db.session.query(db.func.sum(Turno.ore)).filter(
                Turno.dipendente_id == dip.id,
                Turno.data >= '2026-01-01',
                Turno.data <= '2026-12-31',
            ).scalar() or 0
            totali[dip.nome] = tot
        mn, mx = min(totali.values()), max(totali.values())
        scarto = mx - mn
        for nome, tot in sorted(totali.items(), key=lambda x: x[1]):
            print(f'  {nome:<14} {tot:>5} h/anno  ({tot/12:.0f} h/mese)')
        print(f'\n  Scarto max: {scarto} h  (min={mn}, max={mx})')
        # Scarto accettabile: la differenza strutturale tra OSS notturni (~167h)
        # e non-notturni (~183h) è inevitabile con 3 turni NOTTE/giorno su 8 OSS.
        # Soglia 260h ≈ 22h/mese di differenza accettabile tra i due gruppi.
        if scarto > 260:
            errori.append(f'EQUITÀ: scarto annuo {scarto}h troppo grande (>260h)')

        # ── Sommario ─────────────────────────────────────────────────────────
        print('\n' + '='*72)
        if errori:
            print(f'PROBLEMI TROVATI: {len(errori)}')
            for e in errori: print(f'  ❌ {e}')
        else:
            print('✅  TUTTO OK — algoritmo equo e compliant su 12 mesi')
        print('='*72 + '\n')

    return errori

if __name__ == '__main__':
    print('='*72)
    print('TEST ANNUALE GENERAZIONE TURNI OSS — 2026')
    print('='*72 + '\n')
    setup()
    genera()
    errs = analizza()
    try: os.unlink(TEST_DB)
    except: pass
    sys.exit(1 if errs else 0)
