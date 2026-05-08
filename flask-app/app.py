from flask import Flask, jsonify, request, send_file, render_template, session, redirect, url_for, Blueprint
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
import io
import os
from datetime import datetime, date, timedelta

app = Flask(__name__)
app.secret_key = os.environ.get('SESSION_SECRET', 'turni-segreto-2024')
CORS(app, supports_credentials=True, origins='*')

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_raw_db_url = os.environ.get('DATABASE_URL', '')
if _raw_db_url.startswith('postgres://'):
    _raw_db_url = _raw_db_url.replace('postgres://', 'postgresql://', 1)
app.config['SQLALCHEMY_DATABASE_URI'] = (
    _raw_db_url or f"sqlite:///{os.path.join(BASE_DIR, 'gestione_turni.db')}"
)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=30)
# Riconnessione automatica se il server PostgreSQL chiude la connessione
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    'pool_pre_ping': True,       # testa la connessione prima di usarla
    'pool_recycle': 300,         # ricicla le connessioni ogni 5 minuti
    'pool_size': 5,
    'max_overflow': 10,
    'connect_args': {'connect_timeout': 10},
}

db = SQLAlchemy(app)

# Blueprint for React frontend — all routes at /flask-api/api/...
api = Blueprint('api', __name__)


# --- MODELLI DATABASE ---

class Dipendente(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(50), unique=True, nullable=False)
    ruolo = db.Column(db.String(20), nullable=False)
    password = db.Column(db.String(100), default="password123")
    ore_totali = db.Column(db.Integer, default=0)
    notti_fatte = db.Column(db.Integer, default=0)
    ferie = db.Column(db.Integer, default=0)
    malattia = db.Column(db.Integer, default=0)
    is_admin = db.Column(db.Boolean, default=False)
    preferenze_turno = db.Column(db.String(100), default='MATTINO,POMERIGGIO,NOTTE')
    password_changed = db.Column(db.Boolean, default=False)
    last_login = db.Column(db.String(20), default='')
    last_seen = db.Column(db.String(20), default='')
    telefono = db.Column(db.String(20), default='')

    def to_dict(self, include_phone=False):
        return {
            'id': self.id,
            'nome': self.nome,
            'ruolo': self.ruolo,
            'ore_totali': self.ore_totali,
            'notti_fatte': self.notti_fatte,
            'ferie': self.ferie,
            'malattia': self.malattia,
            'is_admin': self.is_admin,
            'preferenze_turno': (self.preferenze_turno or 'MATTINO,POMERIGGIO,NOTTE').split(','),
            'password_changed': bool(self.password_changed),
            'last_login': self.last_login or '',
            'last_seen': self.last_seen or '',
            'telefono': (self.telefono or '') if include_phone else '',
        }


class Turno(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    dipendente_id = db.Column(db.Integer, db.ForeignKey('dipendente.id'), nullable=False)
    data = db.Column(db.String(10), nullable=False)
    tipo = db.Column(db.String(20), nullable=False)
    ore = db.Column(db.Integer, default=8)
    note = db.Column(db.String(200), default='')
    manuale = db.Column(db.Boolean, default=False)
    ora_inizio = db.Column(db.String(5), default='')
    archivio_mese = db.Column(db.String(7), default='')
    dipendente = db.relationship('Dipendente', backref='turni')

    def to_dict(self):
        return {
            'id': self.id,
            'dipendente_id': self.dipendente_id,
            'nome': self.dipendente.nome,
            'ruolo': self.dipendente.ruolo,
            'data': self.data,
            'tipo': self.tipo,
            'ore': self.ore,
            'note': self.note,
            'manuale': bool(self.manuale),
            'ora_inizio': self.ora_inizio or '',
            'archivio_mese': self.archivio_mese or '',
        }


class Assenza(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    dipendente_id = db.Column(db.Integer, db.ForeignKey('dipendente.id'), nullable=False)
    tipo = db.Column(db.String(20), nullable=False, default='MALATTIA')  # MALATTIA | FERIE
    data_inizio = db.Column(db.String(10), nullable=False)
    data_fine = db.Column(db.String(10), nullable=False)
    note = db.Column(db.String(200), default='')
    creata_il = db.Column(db.String(20), default='')
    dipendente = db.relationship('Dipendente', backref=db.backref('assenze', lazy=True))

    def to_dict(self):
        return {
            'id': self.id,
            'dipendente_id': self.dipendente_id,
            'nome_dipendente': self.dipendente.nome if self.dipendente else '',
            'tipo': self.tipo,
            'data_inizio': self.data_inizio,
            'data_fine': self.data_fine,
            'note': self.note,
            'creata_il': self.creata_il,
        }


# --- INIZIALIZZAZIONE STAFF ---

def inizializza_staff():
    """Garantisce che lo staff di base esista nel DB.
    Unico admin: Giustina (DEV, is_admin=True) — accede con MASTER_PASSWORD.
    """
    staff_base = [
        ("Fabiana",    "AUSILIARIO", False),
        ("Marina",     "AUSILIARIO", False),
        ("Angela",     "AUSILIARIO", False),
        ("Carmen",     "OSS",        False),
        ("Roberto",    "OSS",        False),
        ("Barbara",    "OSS",        False),
        ("Vittoria",   "OSS",        False),
        ("Stefania 2", "OSS",        False),
        ("Anna",       "INFERMIERA", False),
        ("Stefania",   "OSS",        False),
        ("Ioana",      "OSS",        False),
        ("Elena",      "OSS",        False),
    ]
    if Dipendente.query.first() is None:
        # Prima installazione: crea Giustina + tutto lo staff
        giustina = Dipendente(nome='Giustina', ruolo='DEV', is_admin=True, password='')
        db.session.add(giustina)
        for nome, ruolo, is_admin in staff_base:
            db.session.add(Dipendente(nome=nome, ruolo=ruolo, is_admin=is_admin, password=''))
        db.session.commit()
        print("Staff inizializzato con Giustina come unica admin.")


# ==========================================
# BLUEPRINT ROUTES — served at /flask-api/api/...
# ==========================================

@api.route('/api/login', methods=['POST'])
def login():
    """Solo Giustina può accedere, con username 'giustina' e MASTER_PASSWORD."""
    data = request.json
    username = str(data.get('username', '')).strip().lower()
    password = str(data.get('password', ''))
    master_pw = os.environ.get('MASTER_PASSWORD', '').strip()
    if username == 'giustina' and master_pw and password == master_pw:
        user = Dipendente.query.filter_by(nome='Giustina').first()
        if user:
            session.permanent = True
            session['user_id'] = user.id
            db.session.commit()
            return jsonify(user.to_dict() | {'success': True})
    return jsonify({'errore': 'Credenziali errate'}), 401


@api.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True})


@api.route('/api/me', methods=['GET'])
def me():
    if 'user_id' not in session:
        return jsonify({'errore': 'Non autenticato'}), 401
    user = db.session.get(Dipendente, session['user_id'])
    if not user:
        return jsonify({'errore': 'Utente non trovato'}), 404
    return jsonify(user.to_dict())


@api.route('/api/dipendenti', methods=['GET'])
def get_dipendenti():
    uid = session.get('user_id')
    viewer = db.session.get(Dipendente, uid) if uid else None
    can_see_phone = bool(viewer and (viewer.is_admin or viewer.ruolo == 'CAPOSALA'))
    dipendenti = Dipendente.query.order_by(Dipendente.ruolo, Dipendente.nome).all()
    return jsonify([d.to_dict(include_phone=can_see_phone) for d in dipendenti])


@api.route('/api/dipendenti', methods=['POST'])
def aggiungi_dipendente():
    if 'user_id' not in session:
        return jsonify({'errore': 'Non autenticato'}), 401
    me = db.session.get(Dipendente, session['user_id'])
    if not me or not (me.is_admin or me.ruolo == 'CAPOSALA'):
        return jsonify({'errore': 'Non autorizzato'}), 403
    data = request.json
    nome = str(data.get('nome', '')).strip()[:50]
    ruolo = str(data.get('ruolo', 'OSS'))
    if not nome:
        return jsonify({'errore': 'Nome obbligatorio'}), 400
    if Dipendente.query.filter_by(nome=nome).first():
        return jsonify({'errore': 'Nome già esistente'}), 400
    password = str(data.get('password', 'password123')).strip() or 'password123'
    nuovo = Dipendente(
        nome=nome,
        ruolo=ruolo,
        password=password,
        password_changed=False,
        preferenze_turno='MATTINO,POMERIGGIO,NOTTE',
    )
    db.session.add(nuovo)
    db.session.commit()
    return jsonify(nuovo.to_dict(include_phone=True)), 201


@api.route('/api/dipendenti/<int:id>', methods=['PUT'])
def aggiorna_dipendente(id):
    if 'user_id' not in session:
        return jsonify({'errore': 'Non autenticato'}), 401
    me = db.session.get(Dipendente, session['user_id'])
    if not me or not (me.is_admin or me.ruolo == 'CAPOSALA'):
        return jsonify({'errore': 'Non autorizzato'}), 403
    d = Dipendente.query.get_or_404(id)
    # Caposala cannot edit other admins
    if not me.is_admin and d.is_admin:
        return jsonify({'errore': 'Non autorizzato'}), 403
    data = request.json
    for field in ['ruolo', 'password', 'ferie', 'malattia', 'preferenze_turno']:
        if field in data:
            setattr(d, field, data[field])
    if 'password_changed' in data:
        d.password_changed = bool(data['password_changed'])
    db.session.commit()
    return jsonify(d.to_dict(include_phone=True))


@api.route('/api/dipendenti/<int:id>', methods=['DELETE'])
def elimina_dipendente(id):
    if 'user_id' not in session:
        return jsonify({'errore': 'Non autenticato'}), 401
    me = db.session.get(Dipendente, session['user_id'])
    if not me or not (me.is_admin or me.ruolo == 'CAPOSALA'):
        return jsonify({'errore': 'Non autorizzato'}), 403
    d = db.session.get(Dipendente, id)
    if not d:
        return jsonify({'errore': 'Dipendente non trovato'}), 404
    if d.is_admin:
        return jsonify({'errore': 'Non puoi eliminare un amministratore'}), 403
    if d.id == me.id:
        return jsonify({'errore': 'Non puoi eliminare te stesso'}), 400
    # Cascade: remove turni, assenze
    Turno.query.filter_by(dipendente_id=id).delete()
    Assenza.query.filter_by(dipendente_id=id).delete()
    nome = d.nome
    db.session.delete(d)
    db.session.commit()
    return jsonify({'success': True, 'nome': nome})


@api.route('/api/assenze', methods=['GET'])
def get_assenze():
    if 'user_id' not in session:
        return jsonify({'errore': 'Non autenticato'}), 401
    dip_id = request.args.get('dipendente_id')
    query = Assenza.query
    if dip_id:
        query = query.filter_by(dipendente_id=int(dip_id))
    assenze = query.order_by(Assenza.data_inizio.desc()).all()
    return jsonify([a.to_dict() for a in assenze])


@api.route('/api/assenze', methods=['POST'])
def aggiungi_assenza():
    if 'user_id' not in session:
        return jsonify({'errore': 'Non autenticato'}), 401
    richiedente = db.session.get(Dipendente, session['user_id'])
    if not richiedente or not (richiedente.is_admin or richiedente.ruolo == 'CAPOSALA'):
        return jsonify({'errore': 'Non autorizzato'}), 403
    data = request.json
    dip_id    = data.get('dipendente_id')
    tipo      = str(data.get('tipo', 'MALATTIA'))[:20]
    d_inizio  = str(data.get('data_inizio', ''))[:10]
    d_fine    = str(data.get('data_fine',   ''))[:10]
    note      = str(data.get('note', ''))[:200]
    if not dip_id or not d_inizio or not d_fine:
        return jsonify({'errore': 'Dati mancanti'}), 400
    if d_inizio > d_fine:
        return jsonify({'errore': 'Data inizio deve precedere la data fine'}), 400
    assenza = Assenza(
        dipendente_id=int(dip_id), tipo=tipo,
        data_inizio=d_inizio, data_fine=d_fine,
        note=note, creata_il=datetime.now().strftime('%Y-%m-%d %H:%M')
    )
    db.session.add(assenza)
    db.session.flush()  # get assenza.id without full commit yet

    # Auto-patch existing shifts in the date range and create missing ones
    patched = 0
    created = 0
    ore_tipo = 0  # FERIE/MALATTIA have 0 hours
    cur = date.fromisoformat(d_inizio)
    end = date.fromisoformat(d_fine)
    while cur <= end:
        data_str = cur.strftime('%Y-%m-%d')
        turno_es = Turno.query.filter_by(dipendente_id=int(dip_id), data=data_str).first()
        if turno_es:
            # Only overwrite if not already another absence type
            if turno_es.tipo not in ('FERIE', 'MALATTIA'):
                turno_es.tipo = tipo
                turno_es.ore = ore_tipo
                turno_es.manuale = True
                patched += 1
        else:
            nuovo = Turno(
                dipendente_id=int(dip_id),
                data=data_str,
                tipo=tipo,
                ore=ore_tipo,
                manuale=True,
                archivio_mese=''
            )
            db.session.add(nuovo)
            created += 1
        cur += timedelta(days=1)

    db.session.commit()
    result = assenza.to_dict()
    result['turni_aggiornati'] = patched
    result['turni_creati'] = created
    return jsonify(result), 201


@api.route('/api/assenze/<int:id>', methods=['DELETE'])
def elimina_assenza(id):
    if 'user_id' not in session:
        return jsonify({'errore': 'Non autenticato'}), 401
    richiedente = db.session.get(Dipendente, session['user_id'])
    if not richiedente or not (richiedente.is_admin or richiedente.ruolo == 'CAPOSALA'):
        return jsonify({'errore': 'Non autorizzato'}), 403
    assenza = db.session.get(Assenza, id)
    if not assenza:
        return jsonify({'errore': 'Assenza non trovata'}), 404

    # Remove auto-created manuale shifts in the absence period so algo can regenerate
    dip_id_ass = assenza.dipendente_id
    tipo_ass   = assenza.tipo
    cur = date.fromisoformat(assenza.data_inizio)
    end = date.fromisoformat(assenza.data_fine)
    rimossi = 0
    while cur <= end:
        data_str = cur.strftime('%Y-%m-%d')
        t = Turno.query.filter_by(
            dipendente_id=dip_id_ass, data=data_str, tipo=tipo_ass, manuale=True
        ).first()
        if t:
            db.session.delete(t)
            rimossi += 1
        cur += timedelta(days=1)

    db.session.delete(assenza)
    db.session.commit()
    return jsonify({'success': True, 'turni_rimossi': rimossi})


@api.route('/api/turni', methods=['GET'])
def get_turni():
    mese         = request.args.get('mese')
    anno         = request.args.get('anno')
    dipendente_id = request.args.get('dipendente_id')
    data_inizio  = request.args.get('data_inizio')
    data_fine    = request.args.get('data_fine')

    includi_archivio = request.args.get('archivio', 'false').lower() == 'true'
    query = Turno.query
    if not includi_archivio:
        query = query.filter(db.or_(Turno.archivio_mese == '', Turno.archivio_mese.is_(None)))
    if mese and anno:
        prefix = f"{anno}-{mese.zfill(2)}"
        query = query.filter(Turno.data.like(f"{prefix}%"))
    if data_inizio:
        query = query.filter(Turno.data >= data_inizio)
    if data_fine:
        query = query.filter(Turno.data <= data_fine)
    if dipendente_id:
        query = query.filter_by(dipendente_id=dipendente_id)

    turni = query.order_by(Turno.data).all()
    return jsonify([t.to_dict() for t in turni])


@api.route('/api/turni', methods=['POST'])
def aggiungi_turno():
    if 'user_id' not in session:
        return jsonify({'errore': 'Non autenticato'}), 401
    data = request.json
    ore_map = {'MATTINO': 7, 'POMERIGGIO': 7, 'NOTTE': 10, 'SMONTO': 0, 'FERIE': 0, 'MALATTIA': 0, 'RIPOSO': 0}
    ore = ore_map.get(data.get('tipo', 'MATTINO'), 8)
    turno = Turno(
        dipendente_id=data['dipendente_id'],
        data=data['data'],
        tipo=data['tipo'],
        ore=ore,
        note=data.get('note', ''),
        manuale=True,
    )
    db.session.add(turno)
    dip = Dipendente.query.get(data['dipendente_id'])
    if dip and dip.ruolo != 'CAPOSALA':
        dip.ore_totali += ore
        if data['tipo'] == 'NOTTE': dip.notti_fatte += 1
        elif data['tipo'] == 'FERIE': dip.ferie += 1
        elif data['tipo'] == 'MALATTIA': dip.malattia += 1
    db.session.commit()
    return jsonify(turno.to_dict()), 201


def _elimina_smonto_successivo(dip_id, data_notte_str):
    """Delete next-day SMONTO when a NOTTE is removed or changed."""
    try:
        from datetime import datetime as _dt, timedelta as _td
        d = _dt.strptime(data_notte_str, '%Y-%m-%d').date()
        domani = (d + _td(days=1)).strftime('%Y-%m-%d')
        smonto = Turno.query.filter_by(dipendente_id=dip_id, data=domani, tipo='SMONTO').first()
        if smonto:
            db.session.delete(smonto)
    except Exception:
        pass


@api.route('/api/turni/<int:id>', methods=['PUT'])
def modifica_turno(id):
    if 'user_id' not in session:
        return jsonify({'errore': 'Non autenticato'}), 401
    richiedente = db.session.get(Dipendente, session['user_id'])
    if not richiedente or not (richiedente.is_admin or richiedente.ruolo == 'CAPOSALA'):
        return jsonify({'errore': 'Non autorizzato'}), 403
    turno = db.session.get(Turno, id)
    if not turno:
        return jsonify({'errore': 'Turno non trovato'}), 404
    data = request.json
    old_dip_id = turno.dipendente_id
    old_tipo   = turno.tipo
    old_data   = turno.data
    ore_map = {'MATTINO': 7, 'POMERIGGIO': 7, 'NOTTE': 10, 'SMONTO': 0, 'FERIE': 0, 'MALATTIA': 0, 'RIPOSO': 0}
    if 'dipendente_id' in data:
        turno.dipendente_id = int(data['dipendente_id'])
    if 'tipo' in data:
        turno.tipo = str(data['tipo'])
        turno.ore = ore_map.get(turno.tipo, 8)
    if 'data' in data:
        turno.data = str(data['data'])[:10]
    if 'note' in data:
        turno.note = str(data['note'])[:200]
    if 'ore' in data:
        turno.ore = int(data['ore'])
    turno.manuale = True
    # Cascade: if this was a NOTTE and tipo changed, delete next-day SMONTO
    if old_tipo == 'NOTTE' and turno.tipo != 'NOTTE':
        _elimina_smonto_successivo(old_dip_id, old_data)
    db.session.commit()
    _ricalcola_statistiche(old_dip_id)
    if turno.dipendente_id != old_dip_id:
        _ricalcola_statistiche(turno.dipendente_id)
    return jsonify(turno.to_dict())


@api.route('/api/turni/<int:id>', methods=['DELETE'])
def elimina_turno(id):
    turno = Turno.query.get_or_404(id)
    dip_id   = turno.dipendente_id
    tipo     = turno.tipo
    data_str = turno.data
    # Cascade: if deleting a NOTTE, remove next-day SMONTO first
    if tipo == 'NOTTE':
        _elimina_smonto_successivo(dip_id, data_str)
    db.session.delete(turno)
    db.session.commit()
    _ricalcola_statistiche(dip_id)
    return jsonify({'success': True})


@api.route('/api/statistiche', methods=['GET'])
def statistiche():
    dipendenti = Dipendente.query.filter(Dipendente.ruolo != 'CAPOSALA').all()
    return jsonify([{
        'id': d.id, 'nome': d.nome, 'ruolo': d.ruolo,
        'ore_totali': d.ore_totali, 'notti_fatte': d.notti_fatte,
        'ferie': d.ferie, 'malattia': d.malattia
    } for d in dipendenti])


def _genera_interno(data_inizio_str, giorni):
    """Core shift generation logic. Called by both genera_turni and genera_giorno."""
    ORE_MAP = {'MATTINO': 7, 'POMERIGGIO': 7, 'NOTTE': 10, 'SMONTO': 0, 'RIPOSO': 0, 'FERIE': 0, 'MALATTIA': 0}
    AUSILIARIO_ORE = 7
    AUSILIARIO_ORARI = {'Marina': '07:00', 'Fabiana': '07:00', 'Angela': '07:00'}

    try:
        data_inizio = datetime.strptime(data_inizio_str, '%Y-%m-%d').date()
    except Exception:
        data_inizio = date.today()

    all_dip = Dipendente.query.order_by(Dipendente.nome).all()

    # Night-eligible = 'NOTTE' in their preferenze_turno field
    def is_notte_eligible(d):
        return 'NOTTE' in (d.preferenze_turno or 'MATTINO,POMERIGGIO').split(',')

    # Separate groups (admin excluded from role-based groups; CAPOSALA excluded entirely)
    admin_staff = [d for d in all_dip if d.is_admin and d.ruolo != 'CAPOSALA']
    infermieri  = [d for d in all_dip if d.ruolo == 'INFERMIERA' and not d.is_admin]
    all_oss     = [d for d in all_dip if d.ruolo == 'OSS'        and not d.is_admin]
    oss_notturni = [d for d in all_oss if is_notte_eligible(d)]
    ausiliari   = [d for d in all_dip if d.ruolo == 'AUSILIARIO' and not d.is_admin]

    if not all_dip:
        return None, 'Nessun dipendente trovato'

    generati = 0
    saltati  = 0

    # Hour equalization: track running cumulative hours per employee for this generation
    ore_corrente: dict = {d.id: (d.ore_totali or 0) for d in all_dip}

    # ── Weekly trackers (per calendar week, keyed by Monday date string) ──
    oss_riposi_week: dict = {}
    oss_notti_week:  dict = {}
    last_cal_week:   str  = ''
    # OSS pulled from must_rest this week: they MUST rest on the next available day
    oss_rest_debt:   set  = set()
    # MAT/POM balance tracker per OSS: per una migliore alternanza mattino/pomeriggio
    # {dip_id: {'MATTINO': n, 'POMERIGGIO': n}}  aggiornato da crea()
    tipo_count: dict = {}

    # ── MEMORIA PREGRESSA: pre-carica turni degli ultimi 30 gg prima di data_inizio ──
    # Questo garantisce che la alternanza MAT/POM ricordi i mesi/settimane precedenti
    # e che non si ripeta lo stesso turno per chi ha già accumulato squilibri.
    _seed_start = (data_inizio - timedelta(days=30)).strftime('%Y-%m-%d')
    _seed_end   = (data_inizio - timedelta(days=1)).strftime('%Y-%m-%d')
    for _t in Turno.query.filter(
        Turno.data >= _seed_start,
        Turno.data <= _seed_end,
        Turno.tipo.in_(['MATTINO', 'POMERIGGIO'])
    ).all():
        _tc = tipo_count.setdefault(_t.dipendente_id, {'MATTINO': 0, 'POMERIGGIO': 0})
        _tc[_t.tipo] += 1

    # ── AUS 6-day block tracker (keyed by (dip_id, block6) where block6 = ordinal // 6) ──
    aus_riposi_6d:  dict = {}
    last_aus_block: int  = -1

    for i in range(giorni):
        giorno   = data_inizio + timedelta(days=i)
        data_str = giorno.strftime('%Y-%m-%d')
        ieri_str = (giorno - timedelta(days=1)).strftime('%Y-%m-%d')
        weekday  = giorno.weekday()  # 0=Mon…6=Sun

        # Calendar-week key: Monday of the current week
        cal_monday = giorno - timedelta(days=weekday)
        cal_week   = cal_monday.strftime('%Y-%m-%d')
        cal_sunday = (cal_monday + timedelta(days=6)).strftime('%Y-%m-%d')

        # On entering a new calendar week: load existing RIPOSO/NOTTE for OSS from DB.
        if cal_week != last_cal_week:
            last_cal_week = cal_week
            oss_rest_debt.clear()   # reset makeup-rest debt at start of each new week
            for r in Turno.query.filter(
                Turno.tipo == 'RIPOSO',
                Turno.data >= cal_week,
                Turno.data <= cal_sunday,
            ).all():
                oss_riposi_week[(r.dipendente_id, cal_week)] = True
            for r in Turno.query.filter(
                Turno.tipo == 'NOTTE',
                Turno.data >= cal_week,
                Turno.data <= cal_sunday,
            ).all():
                oss_notti_week[(r.dipendente_id, cal_week)] = True

        # On entering a new 6-day block: load existing RIPOSO for AUS from DB.
        aus_block = giorno.toordinal() // 6
        if aus_block != last_aus_block:
            last_aus_block = aus_block
            blk_start = date.fromordinal(aus_block * 6).strftime('%Y-%m-%d')
            blk_end   = date.fromordinal(aus_block * 6 + 5).strftime('%Y-%m-%d')
            aus_ids   = [d.id for d in ausiliari]
            if aus_ids:
                for r in Turno.query.filter(
                    Turno.tipo == 'RIPOSO',
                    Turno.data >= blk_start,
                    Turno.data <= blk_end,
                    Turno.dipendente_id.in_(aus_ids)
                ).all():
                    b = date.fromisoformat(r.data).toordinal() // 6
                    aus_riposi_6d[(r.dipendente_id, b)] = True

        # IDs with any existing shift today
        gia = {t.dipendente_id for t in Turno.query.filter_by(data=data_str).all()}

        # Active absences for this day
        assenze_oggi = Assenza.query.filter(
            Assenza.data_inizio <= data_str,
            Assenza.data_fine   >= data_str
        ).all()
        assenti_ids = {a.dipendente_id for a in assenze_oggi}

        # Night-chain tracking from yesterday
        notte_ieri   = {t.dipendente_id for t in Turno.query.filter_by(data=ieri_str, tipo='NOTTE').all()}
        smonto_ieri  = {t.dipendente_id for t in Turno.query.filter_by(data=ieri_str, tipo='SMONTO').all()}
        riposo_ieri  = {t.dipendente_id for t in Turno.query.filter_by(data=ieri_str, tipo='RIPOSO').all()}

        def crea(dip, tipo, ore_override=None, ora_inizio=''):
            nonlocal generati, saltati
            if dip.id in gia:
                saltati += 1
                return False
            ore = ore_override if ore_override is not None else ORE_MAP.get(tipo, 0)
            if not ora_inizio:
                ora_inizio = {'MATTINO': '07:00', 'POMERIGGIO': '14:00', 'NOTTE': '21:00'}.get(tipo, '')
            t = Turno(dipendente_id=dip.id, data=data_str, tipo=tipo, ore=ore, note='Auto', manuale=False, ora_inizio=ora_inizio)
            db.session.add(t)
            gia.add(dip.id)
            if dip.ruolo != 'CAPOSALA':
                dip.ore_totali += ore
                ore_corrente[dip.id] = ore_corrente.get(dip.id, 0) + ore
            if tipo == 'NOTTE':    dip.notti_fatte += 1
            elif tipo == 'FERIE':  dip.ferie       += 1
            elif tipo == 'MALATTIA': dip.malattia  += 1
            # Track MAT/POM balance per employee for alternation
            if tipo in ('MATTINO', 'POMERIGGIO'):
                tc = tipo_count.setdefault(dip.id, {'MATTINO': 0, 'POMERIGGIO': 0})
                tc[tipo] += 1
            generati += 1
            return True

        # ── 0. Pre-assign absence shifts (MALATTIA / FERIE) ──
        for assenza in assenze_oggi:
            dip_a = db.session.get(Dipendente, assenza.dipendente_id)
            if dip_a and dip_a.id not in gia:
                crea(dip_a, assenza.tipo)

        # ── 1. Admin: fixed MATTINO (7h), rest Sunday ──
        for dip in admin_staff:
            if dip.id in gia: continue
            if weekday == 6:
                crea(dip, 'RIPOSO')
            else:
                crea(dip, 'MATTINO', 7)

        # ── 2. Infermiera: MATTINO, rest Sun always, alt-Sat ──
        # Guard: se ieri era già RIPOSO (es. sabato di riposo in settimana pari),
        # la domenica lavora per evitare due riposi consecutivi.
        for dip in infermieri:
            if dip.id in gia: continue
            if weekday == 6:
                if dip.id in riposo_ieri:
                    crea(dip, 'MATTINO', 7)   # ieri già riposo → lavora domenica
                else:
                    crea(dip, 'RIPOSO')
            elif weekday == 5 and (i // 7) % 2 == 0:
                crea(dip, 'RIPOSO')
            else:
                crea(dip, 'MATTINO', 7)

        # ── 3. OSS Night chain: SMONTO (SMONTO alone; post-SMONTO RIPOSO in section 4) ──
        for dip in all_oss:
            if dip.id in gia: continue
            if dip.id in notte_ieri:
                crea(dip, 'SMONTO')
                # Fix A: SMONTO = recupero post-notte, conta come riposo settimanale.
                # Questo evita che l'algoritmo cerchi UN ALTRO riposo nella stessa settimana,
                # ma NON impedisce il RIPOSO post-SMONTO (Fix B lo gestisce con is_post_smonto).
                oss_riposi_week[(dip.id, cal_week)] = True

        # ── 3b. Pre-reserve NOTTE candidate (exclude from regular shift pool) ──
        # Selecting the NOTTE worker BEFORE section 4 guarantees coverage even on Sunday
        # when all notte-eligible OSS would otherwise end up in must_rest and get RIPOSO.
        notte_riserva_id = None
        # Sort NOTTE candidates by hours descending: highest-hour person gets NOTTE first.
        # NOTTE(10h)+SMONTO(0h)+RIPOSO(0h) = only 10h for 3 days → balances those with more hours.
        notte_cands_sorted = sorted(
            oss_notturni,
            key=lambda d: ore_corrente.get(d.id, 0),
            reverse=True
        )
        for cand in notte_cands_sorted:
            if cand.id in gia or cand.id in assenti_ids:
                continue
            if oss_notti_week.get((cand.id, cal_week), False):
                continue  # Prefer fresh (no NOTTE yet this week)
            notte_riserva_id = cand.id
            break
        if notte_riserva_id is None:
            for cand in notte_cands_sorted:
                if cand.id not in gia and cand.id not in assenti_ids:
                    notte_riserva_id = cand.id
                    break
        # (If notte_riserva_id is still None, we'll fall back to double shifts in 4b)

        # ── 4. Remaining OSS: urgency-based exactly 1 RIPOSO per calendar week ──
        # Strategy: each OSS has a designated rest weekday = (rank + week_num_local) % 7.
        # Additionally, on the last day of the week (Sunday / last generation day),
        # anyone who still hasn't rested is forced to rest (urgency = 1).
        # Post-SMONTO rest: OSS who had SMONTO yesterday need today as their RIPOSO.
        week_num_local = i // 7
        is_last_day_of_week = (weekday == 6) or (i == giorni - 1)
        # is_true_sunday: usato per Fix C (niente pull da must_rest) e estensione domenicale.
        # È DISTINTO da is_last_day_of_week (che include l'ultimo giorno di generazione):
        # non vogliamo bloccare la copertura quando il mese finisce a metà settimana.
        is_true_sunday = (weekday == 6)
        n = len(all_oss)
        # Exclude the pre-reserved NOTTE candidate from regular assignment
        oss_liberi = [d for d in all_oss
                      if d.id not in gia and d.id not in assenti_ids
                      and d.id != notte_riserva_id]

        oss_must_rest  = []  # must rest today (designated day, post-SMONTO, or last day)
        oss_may_rest   = []  # haven't rested yet but can wait
        oss_rested     = []  # already have their RIPOSO this week

        for dip in oss_liberi:
            # Fix B: post-SMONTO RIPOSO è sempre obbligatorio, anche se la settimana
            # è già marcata come "riposata" (per via dello SMONTO del Fix A).
            is_post_smonto = dip.id in smonto_ieri
            if is_post_smonto:
                oss_must_rest.append(dip)
                continue
            ha_riposato  = oss_riposi_week.get((dip.id, cal_week), False)
            if ha_riposato:
                oss_rested.append(dip)
                continue
            p_rank        = all_oss.index(dip)
            rest_weekday  = (p_rank + week_num_local) % 7
            # Fix D: OSS con debito riposo (strappati questa settimana) → must_rest ogni giorno
            has_rest_debt = dip.id in oss_rest_debt
            if has_rest_debt or weekday == rest_weekday or is_last_day_of_week:
                oss_must_rest.append(dip)
            else:
                oss_may_rest.append(dip)

        # Fill coverage slots from rested + may_rest first (workers)
        # Sort by: 1) fewest hours (equalization), 2) MAT excess (more MAT → gets POM next)
        def _worker_sort_key(d):
            tc = tipo_count.get(d.id, {'MATTINO': 0, 'POMERIGGIO': 0})
            mat_excess = tc['MATTINO'] - tc['POMERIGGIO']  # positive → had more MAT → prefer POM
            return (ore_corrente.get(d.id, 0), mat_excess)

        workers = oss_rested + oss_may_rest
        workers.sort(key=_worker_sort_key)

        m_c = p_c = 0
        for dip in workers:
            tc = tipo_count.get(dip.id, {'MATTINO': 0, 'POMERIGGIO': 0})
            emp_mat = tc['MATTINO']
            emp_pom = tc['POMERIGGIO']
            # Decide tipo preferito per questo lavoratore basandosi sul suo storico
            prefers_pom = emp_mat > emp_pom  # ha già più mattini → dagli un pomeriggio se possibile

            if m_c < 2 and p_c < 1:
                # Dobbiamo riempire sia MAT che POM: assegna in base alla preferenza
                if prefers_pom and p_c < 1:
                    crea(dip, 'POMERIGGIO'); p_c += 1
                else:
                    crea(dip, 'MATTINO');    m_c += 1
            elif m_c < 2:
                crea(dip, 'MATTINO');    m_c += 1
            elif p_c < 1:
                crea(dip, 'POMERIGGIO'); p_c += 1
            elif m_c < 3:
                if prefers_pom and p_c < 3:
                    crea(dip, 'POMERIGGIO'); p_c += 1
                else:
                    crea(dip, 'MATTINO');    m_c += 1
            elif p_c < 3:
                crea(dip, 'POMERIGGIO'); p_c += 1
            else:
                crea(dip, 'MATTINO');    m_c += 1

        # Pull from must_rest SOLO se la copertura è sotto il minimo critico
        # Fix C: MAI strappare il riposo l'ultimo giorno della settimana (domenica).
        # La domenica garantisce il riposo a chiunque non l'abbia ancora avuto;
        # la copertura viene assicurata dai doppi turni dei già-riposati.
        oss_must_rest.sort(key=lambda d: ore_corrente.get(d.id, 0), reverse=True)
        if not is_true_sunday:
            for dip in list(oss_must_rest):
                # Non strappare OSS post-SMONTO: il loro riposo è sacro
                if dip.id in smonto_ieri:
                    continue
                # Sull'ultimo giorno di generazione del mese, proteggere chi ha già
                # un debito di riposo: sono stati già strappati questa settimana e
                # devono recuperare il riposo prima che la settimana finisca.
                if i == giorni - 1 and dip.id in oss_rest_debt:
                    continue
                if m_c < 2:
                    oss_must_rest.remove(dip)
                    crea(dip, 'MATTINO');    m_c += 1
                    oss_rest_debt.add(dip.id)   # Fix D: deve recuperare il riposo
                elif m_c >= 2 and p_c < 1:
                    oss_must_rest.remove(dip)
                    crea(dip, 'POMERIGGIO'); p_c += 1
                    oss_rest_debt.add(dip.id)   # Fix D: deve recuperare il riposo
                else:
                    break
        # Se domenica (o ultimo giorno del periodo), estendi la copertura SOLO
        # dai notturni già-riposati. NON usare i non-notturni per non gonfiare le ore.
        if is_true_sunday or i == giorni - 1:
            extras = sorted(
                [d for d in oss_rested
                 if d.id not in gia and is_notte_eligible(d)],
                key=lambda d: ore_corrente.get(d.id, 0)
            )
            for dip in extras:
                if m_c >= 3 and p_c >= 2:
                    break
                if m_c < 3:
                    crea(dip, 'MATTINO');    m_c += 1
                elif p_c < 2:
                    crea(dip, 'POMERIGGIO'); p_c += 1

        # Assign RIPOSO — nessun limite giornaliero: garantisce 1 riposo/settimana a rotazione
        oss_must_rest_smonto = [d for d in oss_must_rest if d.id in smonto_ieri]
        oss_must_rest_normali = [d for d in oss_must_rest if d.id not in smonto_ieri]

        for dip in oss_must_rest_smonto:
            # Post-SMONTO RIPOSO è obbligatorio (catena NOTTE→SMONTO→RIPOSO).
            # Il giorno prima era SMONTO (non RIPOSO), quindi non ci può essere un doppio riposo.
            crea(dip, 'RIPOSO')
            oss_riposi_week[(dip.id, cal_week)] = True
            oss_rest_debt.discard(dip.id)

        for dip in oss_must_rest_normali:
            if dip.id in riposo_ieri:
                # Ieri era già RIPOSO: evita due riposi consecutivi → lavora oggi.
                if m_c < 3:
                    crea(dip, 'MATTINO');    m_c += 1
                else:
                    crea(dip, 'POMERIGGIO'); p_c += 1
                # Non segniamo come riposato: prenderà il riposo un altro giorno questa settimana.
            else:
                crea(dip, 'RIPOSO')
                oss_riposi_week[(dip.id, cal_week)] = True
                oss_rest_debt.discard(dip.id)

        # ── 4b. NOTTE assignment — after regular OSS shifts to allow double shifts ──
        #
        # Priority order:
        #   P1: pre-reserved pure NOTTE candidate (selected in section 3b)
        #   P2: POMERIGGIO-NOTTE double (notte-eligible OSS already on POMERIGGIO today)
        #   P3: MATTINO-NOTTE double  (notte-eligible OSS already on MATTINO today)
        #
        def _add_notte_direct(candidate, primo_turno=''):
            """Create NOTTE turno directly, bypassing gia check (for pre-reserved / doubles)."""
            nonlocal generati
            ore_n = ORE_MAP['NOTTE']
            nota  = f'Auto ({primo_turno}+NOTTE)' if primo_turno else 'Auto'
            t = Turno(
                dipendente_id=candidate.id, data=data_str, tipo='NOTTE',
                ore=ore_n, note=nota, manuale=False, ora_inizio=''
            )
            db.session.add(t)
            gia.add(candidate.id)
            candidate.ore_totali += ore_n
            ore_corrente[candidate.id] = ore_corrente.get(candidate.id, 0) + ore_n
            candidate.notti_fatte += 1
            oss_notti_week[(candidate.id, cal_week)] = True
            generati += 1

        assigned_notte = False

        # P1: pure NOTTE — assign to pre-reserved candidate
        if notte_riserva_id is not None:
            for d in oss_notturni:
                if d.id == notte_riserva_id:
                    _add_notte_direct(d)
                    assigned_notte = True
                    break

        # P2: POMERIGGIO-NOTTE double shift fallback
        if not assigned_notte:
            pom_oggi = {
                t.dipendente_id
                for t in Turno.query.filter_by(data=data_str, tipo='POMERIGGIO').all()
            }
            for offset in range(len(oss_notturni)):
                candidate = oss_notturni[(i + offset) % len(oss_notturni)]
                if candidate.id in assenti_ids:
                    continue
                if (candidate.id in pom_oggi
                        and not oss_notti_week.get((candidate.id, cal_week), False)):
                    _add_notte_direct(candidate, 'POMERIGGIO')
                    assigned_notte = True
                    break

        # P3: MATTINO-NOTTE double shift (last resort)
        if not assigned_notte:
            mat_oggi = {
                t.dipendente_id
                for t in Turno.query.filter_by(data=data_str, tipo='MATTINO').all()
            }
            for offset in range(len(oss_notturni)):
                candidate = oss_notturni[(i + offset) % len(oss_notturni)]
                if candidate.id in assenti_ids:
                    continue
                if (candidate.id in mat_oggi
                        and not oss_notti_week.get((candidate.id, cal_week), False)):
                    _add_notte_direct(candidate, 'MATTINO')
                    break

        # ── 4c. MATTINO+POMERIGGIO doubles ──
        # Non-night OSS regularly cover MAT+POM.
        # Night-eligible OSS (Carmen, Barbara, Elena) accumulate far fewer hours per
        # NOTTE cycle (10h for 3 days vs 21h for 3 regular shifts). To equalize monthly
        # totals we also allow them to take MAT+POM doubles on days they are NOT already
        # assigned a NOTTE. The lowest-hours worker gets the double first.
        notte_oggi_ids = {
            t.dipendente_id
            for t in Turno.query.filter_by(data=data_str, tipo='NOTTE').all()
        }

        # 4c fires only when POM coverage is at zero (hard minimum not met).
        # Raising the old threshold (p_c < 2) to (p_c < 1) eliminates the
        # unnecessary MAT+POM doubles that were pushing non-night OSS to ~197h/month.
        if p_c < 1:
            mat_ids_oggi = {
                t.dipendente_id
                for t in Turno.query.filter_by(data=data_str, tipo='MATTINO').all()
            }
            candidati_dop = sorted(
                [d for d in all_oss
                 if d.id in mat_ids_oggi
                 and d.id not in assenti_ids
                 and d.id not in notte_oggi_ids],
                key=lambda d: ore_corrente.get(d.id, 0)
            )
            for dip in candidati_dop:
                if p_c >= 1:
                    break
                ore_p = ORE_MAP['POMERIGGIO']
                db.session.add(Turno(
                    dipendente_id=dip.id, data=data_str, tipo='POMERIGGIO',
                    ore=ore_p, note='Auto (MAT+POM)', manuale=False, ora_inizio='14:00'
                ))
                dip.ore_totali += ore_p
                ore_corrente[dip.id] = ore_corrente.get(dip.id, 0) + ore_p
                generati += 1
                p_c += 1

        # Symmetrical: if MATTINO coverage is still short, any OSS on POMERIGGIO
        # (who has no NOTTE today) can add a MATTINO slot.
        if m_c < 2:
            pom_ids_oggi = {
                t.dipendente_id
                for t in Turno.query.filter_by(data=data_str, tipo='POMERIGGIO').all()
            }
            candidati_mat = sorted(
                [d for d in all_oss
                 if d.id in pom_ids_oggi
                 and d.id not in assenti_ids
                 and d.id not in notte_oggi_ids],
                key=lambda d: ore_corrente.get(d.id, 0)
            )
            for dip in candidati_mat:
                if m_c >= 2:
                    break
                ore_m = ORE_MAP['MATTINO']
                db.session.add(Turno(
                    dipendente_id=dip.id, data=data_str, tipo='MATTINO',
                    ore=ore_m, note='Auto (POM+MAT)', manuale=False, ora_inizio='07:00'
                ))
                dip.ore_totali += ore_m
                ore_corrente[dip.id] = ore_corrente.get(dip.id, 0) + ore_m
                generati += 1
                m_c += 1

        # ── 4c-fallback. Emergency coverage: usa oss_rested quando la copertura
        #    minima non è stata raggiunta dalle sezioni precedenti. ──
        if m_c < 2 or p_c < 1:
            emergency_pool = sorted(
                [d for d in oss_rested if d.id not in gia],
                key=lambda d: ore_corrente.get(d.id, 0)
            )
            for dip in emergency_pool:
                if m_c >= 2 and p_c >= 1:
                    break
                if m_c < 2:
                    crea(dip, 'MATTINO');    m_c += 1
                elif p_c < 1:
                    crea(dip, 'POMERIGGIO'); p_c += 1

        # ── 4d. Equalization doubles for night-eligible OSS ──
        # Each NOTTE cycle (NOTTE 10h + SMONTO 0h + RIPOSO 0h) gives only 10h for
        # 3 days while non-night workers accumulate ~21h in the same period.
        # This dedicated pass fires ONLY on regular working days (when the worker
        # already has MATTINO or POMERIGGIO) and adds the complementary shift whenever
        # the worker's running total is more than 7h below the OSS group average.
        # Threshold = 7h ≈ 1 regular shift: fires ~1 extra double per NOTTE cycle,
        # bridging the gap to ~173 h/month without overshooting.
        if all_oss:
            avg_ore_4d = sum(ore_corrente.get(d.id, 0) for d in all_oss) / len(all_oss)
            mat_ids_4d = {
                t.dipendente_id
                for t in Turno.query.filter_by(data=data_str, tipo='MATTINO').all()
            }
            pom_ids_4d = {
                t.dipendente_id
                for t in Turno.query.filter_by(data=data_str, tipo='POMERIGGIO').all()
            }
            for dip in sorted(
                [d for d in all_oss
                 if is_notte_eligible(d)
                 and d.id not in assenti_ids
                 and d.id not in notte_oggi_ids],
                key=lambda d: ore_corrente.get(d.id, 0)
            ):
                gap = avg_ore_4d - ore_corrente.get(dip.id, 0)
                if gap <= 3:
                    continue
                if dip.id in mat_ids_4d and dip.id not in pom_ids_4d:
                    ore_p = ORE_MAP['POMERIGGIO']
                    db.session.add(Turno(
                        dipendente_id=dip.id, data=data_str, tipo='POMERIGGIO',
                        ore=ore_p, note='Auto (EQ)', manuale=False, ora_inizio='14:00'
                    ))
                    dip.ore_totali += ore_p
                    ore_corrente[dip.id] = ore_corrente.get(dip.id, 0) + ore_p
                    generati += 1
                elif dip.id in pom_ids_4d and dip.id not in mat_ids_4d:
                    ore_m = ORE_MAP['MATTINO']
                    db.session.add(Turno(
                        dipendente_id=dip.id, data=data_str, tipo='MATTINO',
                        ore=ore_m, note='Auto (EQ)', manuale=False, ora_inizio='07:00'
                    ))
                    dip.ore_totali += ore_m
                    ore_corrente[dip.id] = ore_corrente.get(dip.id, 0) + ore_m
                    generati += 1

        # ── 5. Ausiliari: 07–15, exactly 1 RIPOSO every 6 days (block-based) ──
        # aus_block computed above when loading DB records.
        # Each AUS rests on the day within the 6-day block matching their rank-offset.
        n_aus = len(ausiliari)
        aus_libere = [d for d in ausiliari if d.id not in gia and d.id not in assenti_ids]

        aus_must_rest = []
        aus_workers   = []

        day_in_block        = giorno.toordinal() % 6       # 0–5 position within current 6-day block
        is_last_day_of_block = (day_in_block == 5) or (i == giorni - 1)

        for dip in aus_libere:
            ha_riposato = aus_riposi_6d.get((dip.id, aus_block), False)
            if ha_riposato:
                aus_workers.append(dip)
                continue
            p_rank           = ausiliari.index(dip)
            rest_day_in_block = (p_rank + aus_block) % 6
            if day_in_block == rest_day_in_block or is_last_day_of_block:
                aus_must_rest.append(dip)
            else:
                aus_workers.append(dip)

        # Ensure at least 1 ausiliario works each day
        if not aus_workers and aus_must_rest:
            aus_workers.append(aus_must_rest.pop())

        for dip in aus_workers:
            ora = AUSILIARIO_ORARI.get(dip.nome, '07:00')
            crea(dip, 'MATTINO', AUSILIARIO_ORE, ora_inizio=ora)

        for dip in aus_must_rest:
            if dip.id in riposo_ieri:
                # Ieri era già RIPOSO: evita due riposi consecutivi → lavora oggi.
                ora = AUSILIARIO_ORARI.get(dip.nome, '07:00')
                crea(dip, 'MATTINO', AUSILIARIO_ORE, ora_inizio=ora)
                # Non segniamo come riposata: riposerà nel prossimo blocco da 6 giorni.
            else:
                crea(dip, 'RIPOSO')
                aus_riposi_6d[(dip.id, aus_block)] = True

        db.session.commit()

    return {'success': True, 'generati': generati, 'saltati': saltati, 'giorni': giorni}, None


@api.route('/api/turni/genera', methods=['POST'])
def genera_turni():
    if 'user_id' not in session:
        return jsonify({'errore': 'Non autenticato'}), 401
    richiedente = db.session.get(Dipendente, session['user_id'])
    if not richiedente or not (richiedente.is_admin or richiedente.ruolo == 'CAPOSALA'):
        return jsonify({'errore': 'Non autorizzato'}), 403
    data = request.json or {}
    modalita = data.get('modalita', 'settimana')
    giorni = 1 if modalita == 'giorno' else (30 if modalita == 'mese' else 7)
    result, err = _genera_interno(data.get('data_inizio', date.today().strftime('%Y-%m-%d')), giorni)
    if err: return jsonify({'errore': err}), 400
    result['modalita'] = modalita
    return jsonify(result)


@api.route('/api/turni/genera_giorno', methods=['POST'])
def genera_giorno():
    if 'user_id' not in session:
        return jsonify({'errore': 'Non autenticato'}), 401
    richiedente = db.session.get(Dipendente, session['user_id'])
    if not richiedente or not (richiedente.is_admin or richiedente.ruolo == 'CAPOSALA'):
        return jsonify({'errore': 'Non autorizzato'}), 403
    data = request.json or {}
    data_str = data.get('data', date.today().strftime('%Y-%m-%d'))
    result, err = _genera_interno(data_str, 1)
    if err: return jsonify({'errore': err}), 400
    result['modalita'] = 'giorno'
    return jsonify(result)


@api.route('/api/turni/pianifica_dipendente', methods=['POST'])
def pianifica_dipendente():
    """Pianifica i turni per un dipendente appena aggiunto a partire da oggi fino a fine mese."""
    if 'user_id' not in session:
        return jsonify({'errore': 'Non autenticato'}), 401
    richiedente = db.session.get(Dipendente, session['user_id'])
    if not richiedente or not richiedente.is_admin:
        return jsonify({'errore': 'Non autorizzato'}), 403
    req_data = request.json or {}
    dip_id = req_data.get('dipendente_id')
    if not dip_id:
        return jsonify({'errore': 'dipendente_id richiesto'}), 400
    dip = db.session.get(Dipendente, dip_id)
    if not dip:
        return jsonify({'errore': 'Dipendente non trovato'}), 404
    # Genera da oggi fino a fine mese corrente
    oggi = date.today()
    import calendar as _cal
    ultimo_giorno = _cal.monthrange(oggi.year, oggi.month)[1]
    fine_mese = date(oggi.year, oggi.month, ultimo_giorno)
    giorni_rimasti = (fine_mese - oggi).days + 1
    if giorni_rimasti < 1:
        giorni_rimasti = 1
    result, err = _genera_interno(oggi.strftime('%Y-%m-%d'), giorni_rimasti)
    if err:
        return jsonify({'errore': err}), 400
    result['dipendente'] = dip.nome
    result['modalita'] = 'pianifica_dipendente'
    return jsonify(result)


@api.route('/api/genera_programmazione', methods=['POST'])
def genera_programmazione():
    return genera_turni()


@api.route('/api/turni/archivia', methods=['POST'])
def archivia_turni():
    if 'user_id' not in session:
        return jsonify({'errore': 'Non autenticato'}), 401
    richiedente = db.session.get(Dipendente, session['user_id'])
    if not richiedente or not (richiedente.is_admin or richiedente.ruolo == 'CAPOSALA'):
        return jsonify({'errore': 'Non autorizzato'}), 403
    data = request.json or {}
    mese = data.get('mese', date.today().strftime('%Y-%m'))
    turni = Turno.query.filter(
        Turno.data.like(f"{mese}%"),
        db.or_(Turno.archivio_mese == '', Turno.archivio_mese.is_(None))
    ).all()
    count = 0
    for t in turni:
        t.archivio_mese = mese
        count += 1
    db.session.commit()
    return jsonify({'success': True, 'archiviati': count, 'mese': mese})


@api.route('/api/archivio', methods=['GET'])
def get_archivio_mesi():
    if 'user_id' not in session:
        return jsonify({'errore': 'Non autenticato'}), 401
    from sqlalchemy import func
    risultati = db.session.query(
        Turno.archivio_mese,
        func.count(Turno.id).label('count')
    ).filter(
        Turno.archivio_mese != '',
        Turno.archivio_mese.isnot(None)
    ).group_by(Turno.archivio_mese).order_by(Turno.archivio_mese.desc()).all()
    return jsonify([{'mese': r[0], 'count': r[1]} for r in risultati])


@api.route('/api/archivio/<mese>', methods=['GET'])
def get_archivio_mese(mese):
    if 'user_id' not in session:
        return jsonify({'errore': 'Non autenticato'}), 401
    turni = Turno.query.filter_by(archivio_mese=mese).order_by(Turno.data).all()
    return jsonify([t.to_dict() for t in turni])


@api.route('/api/reset_completo', methods=['POST'])
def reset_completo():
    if 'user_id' not in session:
        return jsonify({'errore': 'Non autenticato'}), 401
    richiedente = db.session.get(Dipendente, session['user_id'])
    if not richiedente or not richiedente.is_admin:
        return jsonify({'errore': 'Non autorizzato — solo admin'}), 403
    # Delete ALL shifts and absences
    Assenza.query.delete()
    Turno.query.delete()
    # Reset all stats (except CAPOSALA ore_totali stays 0)
    for d in Dipendente.query.all():
        d.ore_totali = 0
        d.notti_fatte = 0
        d.ferie = 0
        d.malattia = 0
    db.session.commit()
    return jsonify({'success': True})


@api.route('/api/turni/reset_mese', methods=['POST'])
def reset_mese():
    if 'user_id' not in session:
        return jsonify({'errore': 'Non autenticato'}), 401
    richiedente = db.session.get(Dipendente, session['user_id'])
    if not richiedente or not (richiedente.is_admin or richiedente.ruolo == 'CAPOSALA'):
        return jsonify({'errore': 'Non autorizzato'}), 403
    data = request.json or {}
    mese = data.get('mese', date.today().strftime('%Y-%m'))
    turni = Turno.query.filter(
        Turno.data.like(f"{mese}%"),
        Turno.manuale == False,
        db.or_(Turno.archivio_mese == '', Turno.archivio_mese.is_(None))
    ).all()
    eliminati = 0
    for t in turni:
        dip = t.dipendente
        if dip and dip.ruolo != 'CAPOSALA':
            dip.ore_totali = max(0, dip.ore_totali - t.ore)
            if t.tipo == 'NOTTE':    dip.notti_fatte = max(0, dip.notti_fatte - 1)
            elif t.tipo == 'FERIE':  dip.ferie       = max(0, dip.ferie - 1)
            elif t.tipo == 'MALATTIA': dip.malattia  = max(0, dip.malattia - 1)
        db.session.delete(t)
        eliminati += 1
    db.session.commit()
    return jsonify({'success': True, 'eliminati': eliminati, 'mese': mese})


@api.route('/api/turni/cancella_periodo', methods=['POST'])
def cancella_periodo():
    if 'user_id' not in session:
        return jsonify({'errore': 'Non autenticato'}), 401
    richiedente = db.session.get(Dipendente, session['user_id'])
    if not richiedente or not (richiedente.is_admin or richiedente.ruolo == 'CAPOSALA'):
        return jsonify({'errore': 'Non autorizzato'}), 403
    data = request.json or {}
    data_inizio = data.get('data_inizio', '')
    data_fine   = data.get('data_fine', '')
    if not data_inizio or not data_fine:
        return jsonify({'errore': 'data_inizio e data_fine richiesti'}), 400
    if data_fine < data_inizio:
        return jsonify({'errore': 'data_fine deve essere uguale o successiva a data_inizio'}), 400
    turni = Turno.query.filter(
        Turno.data >= data_inizio,
        Turno.data <= data_fine,
        Turno.manuale == False,
    ).all()
    eliminati = 0
    for t in turni:
        dip = t.dipendente
        if dip and dip.ruolo != 'CAPOSALA':
            dip.ore_totali    = max(0, dip.ore_totali - t.ore)
            if t.tipo == 'NOTTE':      dip.notti_fatte = max(0, dip.notti_fatte - 1)
            elif t.tipo == 'FERIE':    dip.ferie       = max(0, dip.ferie - 1)
            elif t.tipo == 'MALATTIA': dip.malattia    = max(0, dip.malattia - 1)
        db.session.delete(t)
        eliminati += 1
    db.session.commit()
    return jsonify({'success': True, 'eliminati': eliminati, 'da': data_inizio, 'a': data_fine})


@api.route('/api/dipendenti/<int:id>/preferenze', methods=['PUT'])
def aggiorna_preferenze(id):
    if 'user_id' not in session:
        return jsonify({'errore': 'Non autenticato'}), 401
    richiedente = db.session.get(Dipendente, session['user_id'])
    if not richiedente or (not richiedente.is_admin and richiedente.ruolo != 'CAPOSALA'):
        return jsonify({'errore': 'Non autorizzato'}), 403
    dip = db.session.get(Dipendente, id)
    if not dip:
        return jsonify({'errore': 'Dipendente non trovato'}), 404

    ORE_TIPO = {'MATTINO': 7, 'POMERIGGIO': 7, 'NOTTE': 10, 'SMONTO': 0}

    preferenze = request.json.get('preferenze', ['MATTINO', 'POMERIGGIO', 'NOTTE'])
    valide = [p for p in preferenze if p in ('MATTINO', 'POMERIGGIO', 'NOTTE')]
    nuove_prefs = set(valide) if valide else {'MATTINO', 'POMERIGGIO', 'NOTTE'}
    vecchie_prefs = set((dip.preferenze_turno or 'MATTINO,POMERIGGIO,NOTTE').split(','))
    tipi_rimossi = vecchie_prefs - nuove_prefs

    # Save new preferences first
    dip.preferenze_turno = ','.join(sorted(nuove_prefs))
    db.session.flush()

    # ── Riadatta turni futuri ──────────────────────────────────────────────
    # For each shift type removed from this person's preferences, find their
    # future auto-generated turni of that type, remove them, and try to
    # reassign them to another eligible staff member.
    oggi = date.today().strftime('%Y-%m-%d')
    riadattati = 0

    for tipo_rimosso in tipi_rimossi:
        turni_da_spost = Turno.query.filter(
            Turno.dipendente_id == dip.id,
            Turno.data >= oggi,
            Turno.tipo == tipo_rimosso,
            Turno.manuale == False
        ).order_by(Turno.data).all()

        for t in turni_da_spost:
            data_turno = t.data

            # Remove the turno from the original person
            dip.ore_totali = max(0, dip.ore_totali - (t.ore or 0))
            if tipo_rimosso == 'NOTTE':
                dip.notti_fatte = max(0, dip.notti_fatte - 1)
                # Also remove the SMONTO the next day (auto-generated chain)
                try:
                    from datetime import timedelta
                    smonto_date = (date.fromisoformat(data_turno) + timedelta(days=1)).strftime('%Y-%m-%d')
                except Exception:
                    smonto_date = None
                if smonto_date:
                    smonto_t = Turno.query.filter_by(
                        dipendente_id=dip.id, data=smonto_date,
                        tipo='SMONTO', manuale=False
                    ).first()
                    if smonto_t:
                        dip.ore_totali = max(0, dip.ore_totali - (smonto_t.ore or 0))
                        db.session.delete(smonto_t)
            db.session.delete(t)

            # ── Find a replacement ─────────────────────────────────────────
            candidati = (
                Dipendente.query
                .filter(
                    Dipendente.id != dip.id,
                    Dipendente.ruolo == dip.ruolo,
                    Dipendente.is_admin == False
                )
                .all()
            )
            # Filter: must have the removed tipo in their new preferences
            # and must not already have any turno on that date
            candidati_ok = [
                c for c in candidati
                if tipo_rimosso in (c.preferenze_turno or 'MATTINO,POMERIGGIO,NOTTE').split(',')
                and not Turno.query.filter_by(dipendente_id=c.id, data=data_turno).first()
            ]

            if not candidati_ok:
                # No direct replacement found — leave unfilled (will be fixed at next generation)
                riadattati += 1
                continue

            # Pick the candidate with fewest ore_totali (most rested)
            sostituto = min(candidati_ok, key=lambda c: c.ore_totali)
            ore_n = ORE_TIPO.get(tipo_rimosso, 7)
            nuovo_t = Turno(
                dipendente_id=sostituto.id, data=data_turno, tipo=tipo_rimosso,
                ore=ore_n, note=f'Riadatto ({dip.nome}→{sostituto.nome})', manuale=False,
                ora_inizio=''
            )
            db.session.add(nuovo_t)
            sostituto.ore_totali += ore_n
            if tipo_rimosso == 'NOTTE':
                sostituto.notti_fatte += 1
                # Add SMONTO next day for the replacement if free
                if smonto_date and not Turno.query.filter_by(
                        dipendente_id=sostituto.id, data=smonto_date).first():
                    smonto_new = Turno(
                        dipendente_id=sostituto.id, data=smonto_date, tipo='SMONTO',
                        ore=0, note=f'Riadatto ({dip.nome}→{sostituto.nome})', manuale=False,
                        ora_inizio=''
                    )
                    db.session.add(smonto_new)
            riadattati += 1

    db.session.commit()
    result = dip.to_dict()
    result['riadattati'] = riadattati
    result['tipi_rimossi'] = list(tipi_rimossi)
    return jsonify(result)


@api.route('/api/manifest.json', methods=['GET'])
def manifest():
    return send_file(os.path.join(BASE_DIR, 'manifest.json'), mimetype='application/manifest+json')


@api.route('/api/genera_report_mensile', methods=['GET'])
def genera_pdf():
    import calendar as _cal
    from reportlab.lib.pagesizes import landscape
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm

    mese = int(request.args.get('mese', datetime.now().month))
    anno = int(request.args.get('anno', datetime.now().year))

    user_id = session.get('user_id')
    me = db.session.get(Dipendente, user_id) if user_id else None
    if not me:
        return jsonify({'errore': 'Non autenticato'}), 401
    is_privileged = me.is_admin or me.ruolo == 'CAPOSALA'

    nome_mesi = ['', 'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
                 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']
    giorni_del_mese = _cal.monthrange(anno, mese)[1]
    prefix = f"{anno}-{str(mese).zfill(2)}"

    # Colours
    C_NAVY    = colors.HexColor('#0f172a')
    C_NAVY2   = colors.HexColor('#1e3a5f')
    C_GOLD    = colors.HexColor('#FFBF00')
    C_WHITE   = colors.white
    C_GRAY1   = colors.HexColor('#f8fafc')
    C_GRAY2   = colors.HexColor('#e2e8f0')
    C_BORDER  = colors.HexColor('#cbd5e1')

    SHIFT_COLOR = {
        'MATTINO':    colors.HexColor('#FFF8E1'),
        'POMERIGGIO': colors.HexColor('#FFF3E0'),
        'NOTTE':      colors.HexColor('#EEF0FF'),
        'SMONTO':     colors.HexColor('#F5F0FF'),
        'FERIE':      colors.HexColor('#E8F5E9'),
        'MALATTIA':   colors.HexColor('#FFEBEE'),
        'RIPOSO':     colors.HexColor('#F1F5F9'),
    }
    SHIFT_TEXT = {
        'MATTINO':    colors.HexColor('#92400E'),
        'POMERIGGIO': colors.HexColor('#9A3412'),
        'NOTTE':      colors.HexColor('#3730A3'),
        'SMONTO':     colors.HexColor('#6D28D9'),
        'FERIE':      colors.HexColor('#065F46'),
        'MALATTIA':   colors.HexColor('#991B1B'),
        'RIPOSO':     colors.HexColor('#64748B'),
    }
    SHIFT_ABB = {
        'MATTINO': 'MAT', 'POMERIGGIO': 'POM', 'NOTTE': 'NOT',
        'SMONTO': 'SMO', 'FERIE': 'FER', 'MALATTIA': 'MAL', 'RIPOSO': 'RIP',
    }

    # Turni del mese
    turni_mese = Turno.query.filter(Turno.data.like(f"{prefix}%")).all()
    turni_map = {}
    for t in turni_mese:
        day = int(t.data.split('-')[2])
        turni_map[(t.dipendente_id, day)] = t.tipo

    # Stats per persona (dal mese corrente)
    stats = {}
    for t in turni_mese:
        d_id = t.dipendente_id
        if d_id not in stats:
            stats[d_id] = {'ore': 0, 'mat': 0, 'pom': 0, 'not': 0, 'smo': 0,
                           'fer': 0, 'mal': 0, 'rip': 0, 'lav': 0}
        s = stats[d_id]
        s['ore'] += t.ore
        tipo = t.tipo
        if tipo == 'MATTINO':    s['mat'] += 1; s['lav'] += 1
        elif tipo == 'POMERIGGIO': s['pom'] += 1; s['lav'] += 1
        elif tipo == 'NOTTE':    s['not'] += 1; s['lav'] += 1
        elif tipo == 'SMONTO':   s['smo'] += 1
        elif tipo == 'FERIE':    s['fer'] += 1
        elif tipo == 'MALATTIA': s['mal'] += 1
        elif tipo == 'RIPOSO':   s['rip'] += 1

    if is_privileged:
        dip_list = Dipendente.query.order_by(Dipendente.ruolo, Dipendente.nome).all()
        dip_list = [d for d in dip_list if not d.is_admin or d.ruolo != 'CAPOSALA']
    else:
        dip_list = [me]

    buffer = io.BytesIO()
    PAGE = landscape(A4)
    doc = SimpleDocTemplate(
        buffer, pagesize=PAGE,
        topMargin=15*mm, bottomMargin=15*mm,
        leftMargin=10*mm, rightMargin=10*mm
    )
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle('title', fontName='Helvetica-Bold', fontSize=16,
                                  textColor=C_WHITE, spaceAfter=2)
    sub_style   = ParagraphStyle('sub',   fontName='Helvetica',      fontSize=9,
                                  textColor=C_GOLD,  spaceAfter=0)
    sec_style   = ParagraphStyle('sec',   fontName='Helvetica-Bold', fontSize=10,
                                  textColor=C_NAVY,  spaceBefore=8, spaceAfter=4)

    elements = []

    # ── HEADER BANNER ──────────────────────────────────────────────────────────
    page_w = PAGE[0] - 20*mm
    header_data = [[
        Paragraph(f"SmartShift Pro — Calendario Turni", title_style),
        Paragraph(
            f"{nome_mesi[mese]} {anno}  |  Generato il {datetime.now().strftime('%d/%m/%Y %H:%M')}",
            sub_style
        ),
    ]]
    header_tbl = Table(header_data, colWidths=[page_w * 0.55, page_w * 0.45])
    header_tbl.setStyle(TableStyle([
        ('BACKGROUND',   (0, 0), (-1, -1), C_NAVY),
        ('TOPPADDING',   (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING',(0, 0), (-1, -1), 10),
        ('LEFTPADDING',  (0, 0), (-1, -1), 12),
        ('RIGHTPADDING', (0, 0), (-1, -1), 12),
        ('VALIGN',       (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN',        (1, 0), (1, 0),   'RIGHT'),
        ('ROUNDEDCORNERS', [4, 4, 4, 4]),
    ]))
    elements.append(header_tbl)
    elements.append(Spacer(1, 6*mm))

    # ── LEGENDA TURNI ──────────────────────────────────────────────────────────
    leg_data = [['LEGENDA:']]
    leg_items = []
    for tipo, abb in SHIFT_ABB.items():
        cell = Paragraph(f'<b>{abb}</b>', ParagraphStyle('l', fontName='Helvetica-Bold',
                         fontSize=7, textColor=SHIFT_TEXT[tipo]))
        leg_items.append(cell)
    leg_data = [leg_items]
    col_w = page_w / len(SHIFT_ABB)
    leg_tbl = Table(leg_data, colWidths=[col_w] * len(SHIFT_ABB), rowHeights=[14])
    leg_style = [
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.3, C_BORDER),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]
    for idx, tipo in enumerate(SHIFT_ABB.keys()):
        leg_style.append(('BACKGROUND', (idx, 0), (idx, 0), SHIFT_COLOR[tipo]))
    leg_tbl.setStyle(TableStyle(leg_style))
    elements.append(leg_tbl)
    elements.append(Spacer(1, 4*mm))

    # ── CALENDARIO GRID ────────────────────────────────────────────────────────
    # Giorni della settimana abbreviati
    GIORNI_SETT = ['Lu','Ma','Me','Gi','Ve','Sa','Do']
    giorno_sett_map = {}
    for d in range(1, giorni_del_mese + 1):
        wd = _cal.weekday(anno, mese, d)
        giorno_sett_map[d] = GIORNI_SETT[wd]

    name_col_w  = 70
    role_col_w  = 45
    day_col_w   = (page_w - name_col_w - role_col_w) / giorni_del_mese

    # Header row: nomi giorno
    header_row1 = [
        Paragraph('<b>Dipendente</b>', ParagraphStyle('h', fontName='Helvetica-Bold', fontSize=7, textColor=C_WHITE)),
        Paragraph('<b>Ruolo</b>',      ParagraphStyle('h', fontName='Helvetica-Bold', fontSize=7, textColor=C_WHITE)),
    ]
    for d in range(1, giorni_del_mese + 1):
        wd_label = giorno_sett_map[d]
        is_we = wd_label in ('Sa', 'Do')
        col_txt = f'<b>{d}</b>\n{wd_label}'
        p = Paragraph(col_txt, ParagraphStyle('dh', fontName='Helvetica-Bold', fontSize=6,
                                               textColor=colors.HexColor('#F59E0B') if is_we else C_WHITE,
                                               alignment=1, leading=8))
        header_row1.append(p)

    grid_data  = [header_row1]
    grid_style = [
        ('BACKGROUND',    (0, 0), (-1, 0), C_NAVY2),
        ('ALIGN',         (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
        ('FONTSIZE',      (0, 0), (-1, -1), 6),
        ('GRID',          (0, 0), (-1, -1), 0.3, C_BORDER),
        ('TOPPADDING',    (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ('LEFTPADDING',   (0, 0), (-1, -1), 1),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 1),
    ]

    RUOLO_ORD = {'OSS': 0, 'INFERMIERA': 1, 'AUSILIARIO': 2, 'CAPOSALA': 3, 'DEV': 4}
    dip_list_sorted = sorted(dip_list, key=lambda d: (RUOLO_ORD.get(d.ruolo, 9), d.nome))

    row_colors_bg = [C_GRAY1, C_WHITE]
    for row_idx, dip in enumerate(dip_list_sorted):
        row_bg = row_colors_bg[row_idx % 2]
        name_p = Paragraph(f'<b>{dip.nome}</b>', ParagraphStyle('n', fontName='Helvetica-Bold',
                            fontSize=7, textColor=C_NAVY))
        role_p = Paragraph(dip.ruolo[:3], ParagraphStyle('r', fontName='Helvetica',
                            fontSize=6, textColor=colors.HexColor('#475569'), alignment=1))
        row = [name_p, role_p]
        for d in range(1, giorni_del_mese + 1):
            tipo = turni_map.get((dip.id, d), '')
            abb  = SHIFT_ABB.get(tipo, '')
            p    = Paragraph(abb, ParagraphStyle('c', fontName='Helvetica-Bold', fontSize=6,
                                                  textColor=SHIFT_TEXT.get(tipo, C_NAVY) if tipo else C_NAVY,
                                                  alignment=1))
            row.append(p)
        grid_data.append(row)
        ri = row_idx + 1
        grid_style.append(('BACKGROUND', (0, ri), (-1, ri), row_bg))
        for d_idx, d in enumerate(range(1, giorni_del_mese + 1)):
            tipo = turni_map.get((dip.id, d), '')
            if tipo:
                col_i = 2 + d_idx
                grid_style.append(('BACKGROUND', (col_i, ri), (col_i, ri), SHIFT_COLOR[tipo]))
            # Weekend light tint columns
            wd_label = giorno_sett_map[d]
            if wd_label in ('Sa', 'Do') and not tipo:
                col_i = 2 + d_idx
                grid_style.append(('BACKGROUND', (col_i, ri), (col_i, ri), colors.HexColor('#F8F3E0')))

    col_widths = [name_col_w, role_col_w] + [day_col_w] * giorni_del_mese
    grid_tbl = Table(grid_data, colWidths=col_widths, rowHeights=14)
    grid_tbl.setStyle(TableStyle(grid_style))
    elements.append(grid_tbl)
    elements.append(Spacer(1, 6*mm))

    # ── RIEPILOGO STATISTICHE ──────────────────────────────────────────────────
    elements.append(Paragraph("Riepilogo mensile", sec_style))

    sum_header = [
        Paragraph('<b>Dipendente</b>',  ParagraphStyle('sh', fontName='Helvetica-Bold', fontSize=8, textColor=C_WHITE)),
        Paragraph('<b>Ruolo</b>',        ParagraphStyle('sh', fontName='Helvetica-Bold', fontSize=8, textColor=C_WHITE)),
        Paragraph('<b>Giorni lav.</b>',  ParagraphStyle('sh', fontName='Helvetica-Bold', fontSize=8, textColor=C_WHITE, alignment=1)),
        Paragraph('<b>Ore tot.</b>',     ParagraphStyle('sh', fontName='Helvetica-Bold', fontSize=8, textColor=C_WHITE, alignment=1)),
        Paragraph('<b>Mattino</b>',      ParagraphStyle('sh', fontName='Helvetica-Bold', fontSize=8, textColor=C_WHITE, alignment=1)),
        Paragraph('<b>Pomeriggio</b>',   ParagraphStyle('sh', fontName='Helvetica-Bold', fontSize=8, textColor=C_WHITE, alignment=1)),
        Paragraph('<b>Notte</b>',        ParagraphStyle('sh', fontName='Helvetica-Bold', fontSize=8, textColor=C_WHITE, alignment=1)),
        Paragraph('<b>Smonto</b>',       ParagraphStyle('sh', fontName='Helvetica-Bold', fontSize=8, textColor=C_WHITE, alignment=1)),
        Paragraph('<b>Ferie</b>',        ParagraphStyle('sh', fontName='Helvetica-Bold', fontSize=8, textColor=C_WHITE, alignment=1)),
        Paragraph('<b>Malattia</b>',     ParagraphStyle('sh', fontName='Helvetica-Bold', fontSize=8, textColor=C_WHITE, alignment=1)),
        Paragraph('<b>Riposo</b>',       ParagraphStyle('sh', fontName='Helvetica-Bold', fontSize=8, textColor=C_WHITE, alignment=1)),
    ]
    sum_data = [sum_header]
    for dip in dip_list_sorted:
        s = stats.get(dip.id, {})
        def _v(k): return str(s.get(k, 0)) if s.get(k, 0) else '—'
        sum_data.append([
            Paragraph(dip.nome, ParagraphStyle('sn', fontName='Helvetica-Bold', fontSize=8, textColor=C_NAVY)),
            Paragraph(dip.ruolo[:3], ParagraphStyle('sr', fontName='Helvetica', fontSize=7, textColor=colors.HexColor('#475569'))),
            Paragraph(_v('lav'),  ParagraphStyle('sv', fontName='Helvetica', fontSize=8, textColor=C_NAVY, alignment=1)),
            Paragraph(_v('ore'),  ParagraphStyle('sv', fontName='Helvetica-Bold', fontSize=8, textColor=C_NAVY2, alignment=1)),
            Paragraph(_v('mat'),  ParagraphStyle('sv', fontName='Helvetica', fontSize=8, textColor=SHIFT_TEXT['MATTINO'], alignment=1)),
            Paragraph(_v('pom'),  ParagraphStyle('sv', fontName='Helvetica', fontSize=8, textColor=SHIFT_TEXT['POMERIGGIO'], alignment=1)),
            Paragraph(_v('not'),  ParagraphStyle('sv', fontName='Helvetica', fontSize=8, textColor=SHIFT_TEXT['NOTTE'], alignment=1)),
            Paragraph(_v('smo'),  ParagraphStyle('sv', fontName='Helvetica', fontSize=8, textColor=SHIFT_TEXT['SMONTO'], alignment=1)),
            Paragraph(_v('fer'),  ParagraphStyle('sv', fontName='Helvetica', fontSize=8, textColor=SHIFT_TEXT['FERIE'], alignment=1)),
            Paragraph(_v('mal'),  ParagraphStyle('sv', fontName='Helvetica', fontSize=8, textColor=SHIFT_TEXT['MALATTIA'], alignment=1)),
            Paragraph(_v('rip'),  ParagraphStyle('sv', fontName='Helvetica', fontSize=8, textColor=SHIFT_TEXT['RIPOSO'], alignment=1)),
        ])

    sum_col_w = [100, 45, 55, 50, 50, 55, 45, 45, 45, 55, 45]
    sum_tbl = Table(sum_data, colWidths=sum_col_w)
    sum_style_cmds = [
        ('BACKGROUND',    (0, 0), (-1, 0), C_NAVY),
        ('ALIGN',         (0, 0), (-1, -1), 'CENTER'),
        ('ALIGN',         (0, 0), (1, -1),  'LEFT'),
        ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID',          (0, 0), (-1, -1), 0.3, C_BORDER),
        ('TOPPADDING',    (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING',   (0, 0), (1, -1),  6),
    ]
    for ri in range(1, len(sum_data)):
        sum_style_cmds.append(('BACKGROUND', (0, ri), (-1, ri), row_colors_bg[ri % 2]))
    sum_tbl.setStyle(TableStyle(sum_style_cmds))
    elements.append(sum_tbl)

    # ── FOOTER ────────────────────────────────────────────────────────────────
    elements.append(Spacer(1, 4*mm))
    footer_p = Paragraph(
        f'<font size="7" color="#94A3B8">SmartShift Pro  •  Report generato automaticamente  •  '
        f'{datetime.now().strftime("%d/%m/%Y %H:%M")}  •  Riservatezza: USO INTERNO</font>',
        ParagraphStyle('ft', alignment=1)
    )
    elements.append(footer_p)

    doc.build(elements)
    buffer.seek(0)
    filename = f"SmartShift_{nome_mesi[mese]}_{anno}.pdf"
    return send_file(buffer, as_attachment=True, download_name=filename, mimetype='application/pdf')


def _ricalcola_statistiche(dipendente_id):
    dip = Dipendente.query.get(dipendente_id)
    if not dip: return
    turni = Turno.query.filter_by(dipendente_id=dipendente_id).all()
    if dip.ruolo != 'CAPOSALA':
        dip.ore_totali = sum(t.ore for t in turni)
    dip.notti_fatte = sum(1 for t in turni if t.tipo == 'NOTTE')
    dip.ferie = sum(1 for t in turni if t.tipo == 'FERIE')
    dip.malattia = sum(1 for t in turni if t.tipo == 'MALATTIA')


# Register blueprint at /flask-api
app.register_blueprint(api, url_prefix='/flask-api')

# Also keep legacy routes for the HTML template frontend
@app.route('/')
def index():
    return redirect('/login')

@app.route('/login')
def login_page():
    return render_template('login.html')

@app.route('/dashboard')
def dashboard():
    if 'user_id' not in session:
        return redirect('/login')
    user = Dipendente.query.get(session['user_id'])
    return render_template('dashboard.html', user=user)

@app.route('/turni')
def turni_page():
    if 'user_id' not in session:
        return redirect('/login')
    user = Dipendente.query.get(session['user_id'])
    return render_template('turni.html', user=user)

@app.route('/staff')
def staff_page():
    if 'user_id' not in session:
        return redirect('/login')
    user = Dipendente.query.get(session['user_id'])
    return render_template('staff.html', user=user)

# Legacy API routes for HTML templates
@app.route('/api/login', methods=['POST'])
def legacy_login():
    data = request.json
    user = Dipendente.query.filter_by(nome=data.get('username'), password=data.get('password')).first()
    if user:
        session['user_id'] = user.id
        return jsonify({'success': True, 'id': user.id, 'nome': user.nome, 'ruolo': user.ruolo, 'is_admin': user.is_admin})
    return jsonify({'errore': 'Credenziali errate'}), 401

@app.route('/api/logout', methods=['POST'])
def legacy_logout():
    session.clear()
    return jsonify({'success': True})

@app.route('/api/me', methods=['GET'])
def legacy_me():
    if 'user_id' not in session:
        return jsonify({'errore': 'Non autenticato'}), 401
    user = Dipendente.query.get(session['user_id'])
    return jsonify(user.to_dict()) if user else (jsonify({'errore': 'Utente non trovato'}), 404)

@app.route('/api/dipendenti', methods=['GET'])
def legacy_get_dipendenti():
    return jsonify([d.to_dict() for d in Dipendente.query.order_by(Dipendente.ruolo, Dipendente.nome).all()])

@app.route('/api/dipendenti', methods=['POST'])
def legacy_aggiungi_dipendente():
    data = request.json
    if Dipendente.query.filter_by(nome=data['nome']).first():
        return jsonify({'errore': 'Nome già esistente'}), 400
    nuovo = Dipendente(nome=data['nome'], ruolo=data['ruolo'], password=data.get('password', 'password123'))
    db.session.add(nuovo)
    db.session.commit()
    return jsonify(nuovo.to_dict()), 201

@app.route('/api/dipendenti/<int:id>', methods=['PUT'])
def legacy_aggiorna_dipendente(id):
    d = Dipendente.query.get_or_404(id)
    data = request.json
    for field in ['ruolo', 'password', 'ferie', 'malattia']:
        if field in data: setattr(d, field, data[field])
    db.session.commit()
    return jsonify(d.to_dict())

@app.route('/api/dipendenti/<int:id>', methods=['DELETE'])
def legacy_elimina_dipendente(id):
    d = Dipendente.query.get_or_404(id)
    Turno.query.filter_by(dipendente_id=id).delete()
    db.session.delete(d)
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/turni', methods=['GET'])
def legacy_get_turni():
    mese, anno, dip_id = request.args.get('mese'), request.args.get('anno'), request.args.get('dipendente_id')
    query = Turno.query
    if mese and anno: query = query.filter(Turno.data.like(f"{anno}-{mese.zfill(2)}%"))
    if dip_id: query = query.filter_by(dipendente_id=dip_id)
    return jsonify([t.to_dict() for t in query.order_by(Turno.data).all()])

@app.route('/api/turni', methods=['POST'])
def legacy_aggiungi_turno():
    data = request.json
    ore_map = {'MATTINO': 7, 'POMERIGGIO': 7, 'NOTTE': 10, 'FERIE': 0, 'MALATTIA': 0, 'RIPOSO': 0}
    ore = ore_map.get(data.get('tipo', 'MATTINO'), 8)
    turno = Turno(dipendente_id=data['dipendente_id'], data=data['data'], tipo=data['tipo'], ore=ore, note=data.get('note', ''))
    db.session.add(turno)
    dip = Dipendente.query.get(data['dipendente_id'])
    if dip and dip.ruolo != 'CAPOSALA':
        dip.ore_totali += ore
        if data['tipo'] == 'NOTTE': dip.notti_fatte += 1
        elif data['tipo'] == 'FERIE': dip.ferie += 1
        elif data['tipo'] == 'MALATTIA': dip.malattia += 1
    db.session.commit()
    return jsonify(turno.to_dict()), 201

@app.route('/api/turni/<int:id>', methods=['DELETE'])
def legacy_elimina_turno(id):
    turno = Turno.query.get_or_404(id)
    dip = turno.dipendente
    if dip and dip.ruolo != 'CAPOSALA':
        dip.ore_totali = max(0, dip.ore_totali - turno.ore)
        if turno.tipo == 'NOTTE': dip.notti_fatte = max(0, dip.notti_fatte - 1)
        elif turno.tipo == 'FERIE': dip.ferie = max(0, dip.ferie - 1)
        elif turno.tipo == 'MALATTIA': dip.malattia = max(0, dip.malattia - 1)
    db.session.delete(turno)
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/statistiche', methods=['GET'])
def legacy_statistiche():
    return jsonify([{'nome': d.nome, 'ruolo': d.ruolo, 'ore_totali': d.ore_totali, 'notti_fatte': d.notti_fatte, 'ferie': d.ferie, 'malattia': d.malattia} for d in Dipendente.query.all()])

@app.route('/api/genera_report_mensile', methods=['GET'])
def legacy_genera_pdf():
    return genera_pdf()


def startup_init():
    """Eseguito all'avvio sia in dev (python app.py) che in produzione (gunicorn)."""
    db.create_all()
    from sqlalchemy import text, inspect as sa_inspect
    is_pg = 'postgresql' in str(db.engine.url)
    bool_default = 'false' if is_pg else '0'
    try:
        inspector = sa_inspect(db.engine)
        cols = [c['name'] for c in inspector.get_columns('dipendente')]
        with db.engine.connect() as conn:
            for col, coldef in [
                ('preferenze_turno', "VARCHAR(100) DEFAULT 'MATTINO,POMERIGGIO,NOTTE'"),
                ('password_changed', f'BOOLEAN DEFAULT {bool_default}'),
                ('last_login', "VARCHAR(20) DEFAULT ''"),
                ('last_seen', "VARCHAR(20) DEFAULT ''"),
                ('telefono', "VARCHAR(20) DEFAULT ''"),
            ]:
                if col not in cols:
                    conn.execute(text(f"ALTER TABLE dipendente ADD COLUMN {col} {coldef}"))
            turno_cols = [c['name'] for c in inspector.get_columns('turno')]
            if 'manuale' not in turno_cols:
                conn.execute(text(f"ALTER TABLE turno ADD COLUMN manuale BOOLEAN DEFAULT {bool_default}"))
            if 'ora_inizio' not in turno_cols:
                conn.execute(text("ALTER TABLE turno ADD COLUMN ora_inizio VARCHAR(5) DEFAULT ''"))
            if 'archivio_mese' not in turno_cols:
                conn.execute(text("ALTER TABLE turno ADD COLUMN archivio_mese VARCHAR(7) DEFAULT ''"))
            conn.execute(text("UPDATE dipendente SET ruolo='AUSILIARIO' WHERE ruolo='PULIZIE'"))
            # ── Migrazione Giustina: rimuovi vecchi admin (Orlando, Caposala) e aggiungi Giustina ──
            # Rimuovi is_admin da Orlando se esiste (non è più admin)
            conn.execute(text("UPDATE dipendente SET is_admin=false WHERE LOWER(nome)='orlando'"))
            # Rimuovi is_admin da Caposala se esiste (non è più admin)
            conn.execute(text("UPDATE dipendente SET is_admin=false WHERE LOWER(nome)='caposala'"))
            # Crea Giustina se non esiste
            if is_pg:
                conn.execute(text(
                    "INSERT INTO dipendente (nome, ruolo, is_admin, password, ore_totali, notti_fatte, ferie, malattia) "
                    "VALUES ('Giustina', 'DEV', true, '', 0, 0, 0, 0) "
                    "ON CONFLICT (nome) DO UPDATE SET is_admin=true"
                ))
            else:
                exists = conn.execute(text("SELECT COUNT(*) FROM dipendente WHERE nome='Giustina'")).scalar()
                if not exists:
                    conn.execute(text(
                        "INSERT INTO dipendente (nome, ruolo, is_admin, password, ore_totali, notti_fatte, ferie, malattia) "
                        "VALUES ('Giustina', 'DEV', 1, '', 0, 0, 0, 0)"
                    ))
                else:
                    conn.execute(text("UPDATE dipendente SET is_admin=1 WHERE nome='Giustina'"))
            conn.commit()
    except Exception as e:
        print(f"[startup] Migration warning: {e}")
    db.create_all()
    inizializza_staff()
    print("[startup] Init completato.")


# ── Eseguito sia da gunicorn che da python app.py ──
with app.app_context():
    startup_init()


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
