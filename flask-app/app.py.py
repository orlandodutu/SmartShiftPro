from flask import Flask, jsonify, request, send_file, send_from_directory, render_template, session, redirect, url_for, Blueprint
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
FRONTEND_DIST = os.path.abspath(os.path.join(BASE_DIR, '..', 'artifacts', 'gestione-turni-react', 'dist', 'public'))
_raw_db_url = os.environ.get('DATABASE_URL', '')
if _raw_db_url.startswith('postgres://'):
    _raw_db_url = _raw_db_url.replace('postgres://', 'postgresql://', 1)
app.config['SQLALCHEMY_DATABASE_URI'] = (
    _raw_db_url or f"sqlite:///{os.path.join(BASE_DIR, 'gestione_turni.db')}"
)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=30)
_engine_options = {
    'pool_pre_ping': True,
    'pool_recycle': 300,
}
if app.config['SQLALCHEMY_DATABASE_URI'].startswith('postgresql://'):
    _engine_options.update({
        'pool_size': 5,
        'max_overflow': 10,
    })
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = _engine_options
db = SQLAlchemy(app)

# Blueprint for React frontend — all routes at /flask-api/api/...
api = Blueprint('api', __name__)


@api.route('/api/health', methods=['GET'])
def health():
    return jsonify({'ok': True})


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

    def to_dict(self):
        return {
            'id': self.id,
            'nome': self.nome,
            'ruolo': self.ruolo,
            'ore_totali': self.ore_totali,
            'notti_fatte': self.notti_fatte,
            'ferie': self.ferie,
            'malattia': self.malattia,
            'is_admin': self.is_admin,
            'preferenze_turno': sorted(preferenze_obbligatorie(self)),
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


SOLO_MATTINO_NOMI = {'Anna', 'Orlando', 'Fabiana', 'Angela', 'Marina'}

def preferenze_obbligatorie(dip):
    if dip and dip.nome in SOLO_MATTINO_NOMI:
        return {'MATTINO'}
    if dip and dip.ruolo in ('AUSILIARIO', 'INFERMIERA'):
        return {'MATTINO'}
    prefs = (dip.preferenze_turno or 'MATTINO,POMERIGGIO,NOTTE').split(',') if dip else []
    valide = {p for p in prefs if p in ('MATTINO', 'POMERIGGIO', 'NOTTE')}
    return valide or {'MATTINO', 'POMERIGGIO', 'NOTTE'}

def applica_preferenze_obbligatorie(dip):
    prefs = preferenze_obbligatorie(dip)
    dip.preferenze_turno = ','.join(sorted(prefs))
    return prefs

def smonto_ha_notte_precedente(dip_id, data_str):
    try:
        ieri = (datetime.strptime(data_str, '%Y-%m-%d').date() - timedelta(days=1)).strftime('%Y-%m-%d')
    except Exception:
        return False
    return Turno.query.filter_by(dipendente_id=int(dip_id), data=ieri, tipo='NOTTE').first() is not None


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
        ("Orlando",     "AUSILIARIO", False),
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
    if Dipendente.query.filter_by(nome='Giustina').first() is None:
        giustina = Dipendente(nome='Giustina', ruolo='DEV', is_admin=True, password='')
        db.session.add(giustina)
    for nome, ruolo, is_admin in staff_base:
        if Dipendente.query.filter_by(nome=nome).first() is None:
            db.session.add(Dipendente(nome=nome, ruolo=ruolo, is_admin=is_admin, password=''))
    db.session.commit()
    for nome, ruolo, is_admin in staff_base:
        dip = Dipendente.query.filter_by(nome=nome).first()
        if dip:
            dip.ruolo = ruolo
            dip.is_admin = is_admin
            applica_preferenze_obbligatorie(dip)
    giustina = Dipendente.query.filter_by(nome='Giustina').first()
    if giustina:
        giustina.ruolo = 'DEV'
        giustina.is_admin = True
        applica_preferenze_obbligatorie(giustina)
    if Dipendente.query.count() == len(staff_base) + 1:
        for nome, ruolo, is_admin in staff_base:
            dip = Dipendente.query.filter_by(nome=nome).first()
            if dip:
                dip.ruolo = ruolo
                dip.is_admin = is_admin
    db.session.commit()


# ==========================================
# BLUEPRINT ROUTES — served at /flask-api/api/...
# ==========================================

@api.route('/api/login', methods=['POST'])
def login():
    """Solo Giustina può accedere, con username 'giustina' e MASTER_PASSWORD."""
    data = request.json
    username = str(data.get('username', '')).strip().lower()
    password = str(data.get('password', ''))
    master_pw = 'giustina123'
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
    dipendenti = Dipendente.query.order_by(Dipendente.ruolo, Dipendente.nome).all()
    return jsonify([d.to_dict() for d in dipendenti])


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
    nuovo = Dipendente(
        nome=nome,
        ruolo=ruolo,
        preferenze_turno='MATTINO' if ruolo in ('AUSILIARIO', 'INFERMIERA') or nome in SOLO_MATTINO_NOMI else 'MATTINO,POMERIGGIO,NOTTE',
    )
    db.session.add(nuovo)
    db.session.commit()
    return jsonify(nuovo.to_dict()), 201


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
    for field in ['ruolo', 'ferie', 'malattia', 'preferenze_turno']:
        if field in data:
            setattr(d, field, data[field])
    applica_preferenze_obbligatorie(d)
    db.session.commit()
    return jsonify(d.to_dict())


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
    query = Turno.query.join(Dipendente).filter(
        Dipendente.nome != 'Giustina',
        Dipendente.ruolo != 'DEV',
    )
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
    tipo = data.get('tipo', 'MATTINO')
    if tipo == 'SMONTO' and not smonto_ha_notte_precedente(data['dipendente_id'], data['data']):
        return jsonify({'errore': 'SMONTO consentito solo dopo una NOTTE dello stesso dipendente'}), 400
    ore = ore_map.get(tipo, 8)
    turno = Turno(
        dipendente_id=data['dipendente_id'],
        data=data['data'],
        tipo=tipo,
        ore=ore,
        note=data.get('note', ''),
        manuale=True,
    )
    db.session.add(turno)
    dip = Dipendente.query.get(data['dipendente_id'])
    if dip and dip.ruolo != 'CAPOSALA':
        dip.ore_totali += ore
        if tipo == 'NOTTE': dip.notti_fatte += 1
        elif tipo == 'FERIE': dip.ferie += 1
        elif tipo == 'MALATTIA': dip.malattia += 1
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
    if turno.tipo == 'SMONTO' and not smonto_ha_notte_precedente(turno.dipendente_id, turno.data):
        return jsonify({'errore': 'SMONTO consentito solo dopo una NOTTE dello stesso dipendente'}), 400
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
    dipendenti = Dipendente.query.filter(
        Dipendente.ruolo != 'CAPOSALA',
        Dipendente.ruolo != 'DEV',
        Dipendente.nome != 'Giustina',
    ).all()
    return jsonify([{
        'id': d.id, 'nome': d.nome, 'ruolo': d.ruolo,
        'ore_totali': d.ore_totali, 'notti_fatte': d.notti_fatte,
        'ferie': d.ferie, 'malattia': d.malattia,
        'preferenze_turno': sorted(preferenze_obbligatorie(d))
    } for d in dipendenti])


def _genera_interno(data_inizio_str, giorni):
    ORE_MAP = {'MATTINO': 7, 'POMERIGGIO': 7, 'NOTTE': 10, 'SMONTO': 0, 'RIPOSO': 0, 'FERIE': 0, 'MALATTIA': 0}
    try:
        data_inizio = datetime.strptime(data_inizio_str, '%Y-%m-%d').date()
    except Exception:
        data_inizio = date.today()

    data_fine = data_inizio + timedelta(days=giorni - 1)
    turni_auto_esistenti = Turno.query.filter(
        Turno.data >= data_inizio.strftime('%Y-%m-%d'),
        Turno.data <= data_fine.strftime('%Y-%m-%d'),
        Turno.manuale == False,
        db.or_(Turno.archivio_mese == '', Turno.archivio_mese.is_(None))
    ).all()
    for turno_old in turni_auto_esistenti:
        dip_old = turno_old.dipendente
        if dip_old and dip_old.ruolo != 'CAPOSALA':
            dip_old.ore_totali = max(0, (dip_old.ore_totali or 0) - (turno_old.ore or 0))
            if turno_old.tipo == 'NOTTE':
                dip_old.notti_fatte = max(0, (dip_old.notti_fatte or 0) - 1)
            elif turno_old.tipo == 'FERIE':
                dip_old.ferie = max(0, (dip_old.ferie or 0) - 1)
            elif turno_old.tipo == 'MALATTIA':
                dip_old.malattia = max(0, (dip_old.malattia or 0) - 1)
        db.session.delete(turno_old)
    db.session.flush()

    all_dip = Dipendente.query.order_by(Dipendente.nome).all()
    if not all_dip:
        return None, 'Nessun dipendente trovato'

    def is_notte_eligible(d):
        return 'NOTTE' in preferenze_obbligatorie(d)

    def can_work_tipo(d, tipo):
        return tipo in ('RIPOSO', 'SMONTO', 'FERIE', 'MALATTIA') or tipo in preferenze_obbligatorie(d)

    infermieri = [d for d in all_dip if d.ruolo == 'INFERMIERA' and not d.is_admin]
    all_oss = [d for d in all_dip if d.ruolo == 'OSS' and not d.is_admin]
    oss_notturni = [d for d in all_oss if is_notte_eligible(d)]
    ausiliari = [d for d in all_dip if d.ruolo == 'AUSILIARIO' and not d.is_admin]
    orlando = next((d for d in ausiliari if d.nome == 'Orlando'), None)
    aus_base = [d for d in ausiliari if d.nome != 'Orlando']

    generati = 0
    saltati = 0
    ore_corrente = {d.id: (d.ore_totali or 0) for d in all_dip}
    tipo_days = {}
    consec_work = {d.id: 0 for d in all_dip}
    doppi_count = {d.id: 0 for d in all_dip}

    def has_shift(dip, data_str, tipo=None):
        q = Turno.query.filter_by(dipendente_id=dip.id, data=data_str)
        if tipo:
            q = q.filter_by(tipo=tipo)
        return q.first() is not None

    def can_tipo(dip, tipo, giorno):
        count = 0
        for back in range(1, 3):
            ds = (giorno - timedelta(days=back)).strftime('%Y-%m-%d')
            if ds in tipo_days.get(dip.id, {}).get(tipo, set()):
                count += 1
            else:
                break
        return count < 2

    def track(dip, tipo, giorno):
        ds = giorno.strftime('%Y-%m-%d')
        if tipo in ('MATTINO', 'POMERIGGIO'):
            tipo_days.setdefault(dip.id, {}).setdefault(tipo, set()).add(ds)
        if tipo in ('MATTINO', 'POMERIGGIO', 'NOTTE'):
            consec_work[dip.id] = consec_work.get(dip.id, 0) + 1
        elif tipo in ('RIPOSO', 'SMONTO', 'FERIE', 'MALATTIA'):
            consec_work[dip.id] = 0

    def crea(dip, tipo, giorno, ore_override=None, ora_inizio='', allow_double=False, note='Auto'):
        nonlocal generati, saltati
        data_str = giorno.strftime('%Y-%m-%d')
        if has_shift(dip, data_str) and not allow_double:
            saltati += 1
            return False
        if has_shift(dip, data_str, tipo):
            saltati += 1
            return False
        if not can_work_tipo(dip, tipo):
            saltati += 1
            return False
        if tipo == 'SMONTO' and not smonto_ha_notte_precedente(dip.id, data_str):
            saltati += 1
            return False
        ore = ore_override if ore_override is not None else ORE_MAP.get(tipo, 0)
        if not ora_inizio:
            ora_inizio = {'MATTINO': '07:00', 'POMERIGGIO': '14:00', 'NOTTE': '21:00'}.get(tipo, '')
        if allow_double:
            note = note if 'DOPPIO' in note else f'{note} (DOPPIO)'
            doppi_count[dip.id] = doppi_count.get(dip.id, 0) + 1
        db.session.add(Turno(dipendente_id=dip.id, data=data_str, tipo=tipo, ore=ore, note=note, manuale=False, ora_inizio=ora_inizio))
        if dip.ruolo != 'CAPOSALA':
            dip.ore_totali += ore
            ore_corrente[dip.id] = ore_corrente.get(dip.id, 0) + ore
        if tipo == 'NOTTE':
            dip.notti_fatte += 1
        track(dip, tipo, giorno)
        generati += 1
        return True

    def ids_today(giorno, tipo=None):
        q = Turno.query.filter_by(data=giorno.strftime('%Y-%m-%d'))
        if tipo:
            q = q.filter_by(tipo=tipo)
        return {t.dipendente_id for t in q.all()}

    for i in range(giorni):
        giorno = data_inizio + timedelta(days=i)
        data_str = giorno.strftime('%Y-%m-%d')
        weekday = giorno.weekday()
        week_num = i // 7
        wk_start = giorno - timedelta(days=weekday)
        wk_end = wk_start + timedelta(days=6)

        assenze_oggi = Assenza.query.filter(Assenza.data_inizio <= data_str, Assenza.data_fine >= data_str).all()
        assenti_ids = {a.dipendente_id for a in assenze_oggi}
        for ass in assenze_oggi:
            dip_a = db.session.get(Dipendente, ass.dipendente_id)
            if dip_a and not has_shift(dip_a, data_str):
                crea(dip_a, ass.tipo, giorno)

        ieri = (giorno - timedelta(days=1)).strftime('%Y-%m-%d')
        avantieri = (giorno - timedelta(days=2)).strftime('%Y-%m-%d')
        notte_ieri = {t.dipendente_id for t in Turno.query.filter_by(data=ieri, tipo='NOTTE').all()}
        notte_due = {t.dipendente_id for t in Turno.query.filter_by(data=avantieri, tipo='NOTTE').all()}
        smonto_ieri = {t.dipendente_id for t in Turno.query.filter_by(data=ieri, tipo='SMONTO').all()}

        for dip in all_oss:
            if dip.id in assenti_ids or has_shift(dip, data_str):
                continue
            if dip.id in smonto_ieri and dip.id in notte_due:
                crea(dip, 'RIPOSO', giorno)
            elif dip.id in notte_ieri and dip.id in notte_due:
                crea(dip, 'SMONTO', giorno)
            elif dip.id in notte_ieri:
                crea(dip, 'SMONTO', giorno)

        if orlando and orlando.id not in assenti_ids and not has_shift(orlando, data_str):
            crea(orlando, 'RIPOSO' if weekday == 6 else 'MATTINO', giorno, 0 if weekday == 6 else 7, '07:00')

        for dip in infermieri:
            if dip.id in assenti_ids or has_shift(dip, data_str):
                continue
            rest_day = 5 if week_num % 2 == 0 else 6
            crea(dip, 'RIPOSO' if weekday == rest_day else 'MATTINO', giorno, 0 if weekday == rest_day else 7, '07:00')

        for idx, dip in enumerate(aus_base):
            if dip.id in assenti_ids or has_shift(dip, data_str):
                continue
            aus_riposo = ((i + idx) % 7) == 6
            crea(dip, 'RIPOSO' if aus_riposo else 'MATTINO', giorno, 0 if aus_riposo else 7, '07:00')

        for idx, dip in enumerate(all_oss):
            if dip.id in assenti_ids or has_shift(dip, data_str):
                continue
            rested_week = Turno.query.filter(Turno.dipendente_id == dip.id, Turno.data >= wk_start.strftime('%Y-%m-%d'), Turno.data <= wk_end.strftime('%Y-%m-%d'), Turno.tipo == 'RIPOSO').first() is not None
            rest_day = (idx + week_num) % 7
            if consec_work.get(dip.id, 0) >= 6 or (not rested_week and weekday == rest_day):
                crea(dip, 'RIPOSO', giorno)

        oss_ids = {d.id for d in all_oss}
        m_c = len(ids_today(giorno, 'MATTINO') & oss_ids)
        p_c = len(ids_today(giorno, 'POMERIGGIO') & oss_ids)

        blocked_post_night_ids = ids_today(giorno, 'SMONTO') | ids_today(giorno, 'RIPOSO')

        def pool_for(tipo):
            return sorted([d for d in all_oss if d.id not in assenti_ids and d.id not in blocked_post_night_ids and not has_shift(d, data_str) and can_tipo(d, tipo, giorno)], key=lambda d: (ore_corrente.get(d.id, 0), len(tipo_days.get(d.id, {}).get(tipo, set()))))

        while m_c < 3:
            pool = pool_for('MATTINO')
            if not pool:
                break
            if crea(pool[0], 'MATTINO', giorno):
                m_c += 1
        while p_c < 3:
            pool = pool_for('POMERIGGIO')
            if not pool:
                break
            if crea(pool[0], 'POMERIGGIO', giorno):
                p_c += 1

        if not ids_today(giorno, 'NOTTE') and oss_notturni:
            night_pool = sorted([d for d in oss_notturni if d.id not in assenti_ids and not has_shift(d, data_str)], key=lambda d: (d.notti_fatte or 0, ore_corrente.get(d.id, 0)))
            if night_pool:
                crea(night_pool[0], 'NOTTE', giorno)
            else:
                saltati += 1

        m_c = len(ids_today(giorno, 'MATTINO') & oss_ids)
        p_c = len(ids_today(giorno, 'POMERIGGIO') & oss_ids)
        if p_c < 3:
            for dip in sorted([d for d in all_oss if d.id in (ids_today(giorno, 'MATTINO') & oss_ids) and d.id not in ids_today(giorno, 'NOTTE')], key=lambda d: doppi_count.get(d.id, 0)):
                if p_c >= 3:
                    break
                if can_tipo(dip, 'POMERIGGIO', giorno) and crea(dip, 'POMERIGGIO', giorno, allow_double=True, note='Auto (DOPPIO MAT+POM)'):
                    p_c += 1
            for dip in sorted([d for d in all_oss if d.id in (ids_today(giorno, 'MATTINO') & oss_ids) and d.id not in ids_today(giorno, 'NOTTE')], key=lambda d: doppi_count.get(d.id, 0)):
                if p_c >= 3:
                    break
                if crea(dip, 'POMERIGGIO', giorno, allow_double=True, note='Auto (DOPPIO MAT+POM COPERTURA)'):
                    p_c += 1
        if m_c < 3:
            for dip in sorted([d for d in all_oss if d.id in (ids_today(giorno, 'POMERIGGIO') & oss_ids) and d.id not in ids_today(giorno, 'NOTTE')], key=lambda d: doppi_count.get(d.id, 0)):
                if m_c >= 3:
                    break
                if can_tipo(dip, 'MATTINO', giorno) and crea(dip, 'MATTINO', giorno, allow_double=True, note='Auto (DOPPIO MAT+POM)'):
                    m_c += 1
            for dip in sorted([d for d in all_oss if d.id in (ids_today(giorno, 'POMERIGGIO') & oss_ids) and d.id not in ids_today(giorno, 'NOTTE')], key=lambda d: doppi_count.get(d.id, 0)):
                if m_c >= 3:
                    break
                if crea(dip, 'MATTINO', giorno, allow_double=True, note='Auto (DOPPIO MAT+POM COPERTURA)'):
                    m_c += 1

        m_c = len(ids_today(giorno, 'MATTINO') & oss_ids)
        p_c = len(ids_today(giorno, 'POMERIGGIO') & oss_ids)
        blocked_ids = ids_today(giorno, 'RIPOSO') | ids_today(giorno, 'SMONTO')
        if m_c < 3:
            for dip in sorted([d for d in all_oss if d.id not in assenti_ids and d.id not in blocked_ids and d.id not in ids_today(giorno, 'MATTINO')], key=lambda d: doppi_count.get(d.id, 0)):
                if m_c >= 3:
                    break
                if crea(dip, 'MATTINO', giorno, allow_double=True, note='Auto (DOPPIO MAT COPERTURA)'):
                    m_c += 1
        if p_c < 3:
            for dip in sorted([d for d in all_oss if d.id not in assenti_ids and d.id not in blocked_ids and d.id not in ids_today(giorno, 'POMERIGGIO')], key=lambda d: doppi_count.get(d.id, 0)):
                if p_c >= 3:
                    break
                if crea(dip, 'POMERIGGIO', giorno, allow_double=True, note='Auto (DOPPIO POM COPERTURA)'):
                    p_c += 1

        db.session.commit()

    return {'success': True, 'generati': generati, 'saltati': saltati, 'giorni': giorni, 'doppi_turni': sum(doppi_count.values())}, None


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
    if dip.nome in SOLO_MATTINO_NOMI or dip.ruolo in ('AUSILIARIO', 'INFERMIERA'):
        nuove_prefs = {'MATTINO'}
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
                if tipo_rimosso in preferenze_obbligatorie(c)
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
        'MATTINO': C_WHITE, 'POMERIGGIO': C_WHITE, 'NOTTE': C_WHITE,
        'SMONTO': C_WHITE, 'FERIE': C_WHITE, 'MALATTIA': C_WHITE, 'RIPOSO': C_WHITE,
    }
    SHIFT_TEXT = {
        'MATTINO': colors.black, 'POMERIGGIO': colors.black, 'NOTTE': colors.black,
        'SMONTO': colors.black, 'FERIE': colors.black, 'MALATTIA': colors.black, 'RIPOSO': colors.black,
    }
    SHIFT_ABB = {
        'MATTINO': 'M', 'POMERIGGIO': 'P', 'NOTTE': 'N',
        'SMONTO': 'S', 'FERIE': 'F', 'MALATTIA': 'MAL', 'RIPOSO': 'R',
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
    react_index = os.path.join(FRONTEND_DIST, 'index.html')
    if os.path.exists(react_index):
        return send_from_directory(FRONTEND_DIST, 'index.html')
    return redirect('/login')

@app.route('/login')
def login_page():
    react_index = os.path.join(FRONTEND_DIST, 'index.html')
    if os.path.exists(react_index):
        return send_from_directory(FRONTEND_DIST, 'index.html')
    return render_template('login.html')

@app.route('/dashboard')
def dashboard():
    react_index = os.path.join(FRONTEND_DIST, 'index.html')
    if os.path.exists(react_index):
        return send_from_directory(FRONTEND_DIST, 'index.html')
    if 'user_id' not in session:
        return redirect('/login')
    user = Dipendente.query.get(session['user_id'])
    return render_template('dashboard.html', user=user)

@app.route('/turni')
def turni_page():
    react_index = os.path.join(FRONTEND_DIST, 'index.html')
    if os.path.exists(react_index):
        return send_from_directory(FRONTEND_DIST, 'index.html')
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

@app.route('/assets/<path:filename>')
def react_assets(filename):
    return send_from_directory(os.path.join(FRONTEND_DIST, 'assets'), filename)

@app.route('/genera')
@app.route('/caposala')
@app.route('/griglia')
@app.route('/archivio')
def react_spa_routes():
    react_index = os.path.join(FRONTEND_DIST, 'index.html')
    if os.path.exists(react_index):
        return send_from_directory(FRONTEND_DIST, 'index.html')
    return redirect('/login')

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
    query = Turno.query.join(Dipendente).filter(
        Dipendente.nome != 'Giustina',
        Dipendente.ruolo != 'DEV',
    )
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
        if tipo == 'NOTTE': dip.notti_fatte += 1
        elif tipo == 'FERIE': dip.ferie += 1
        elif tipo == 'MALATTIA': dip.malattia += 1
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
    return jsonify([{'nome': d.nome, 'ruolo': d.ruolo, 'ore_totali': d.ore_totali, 'notti_fatte': d.notti_fatte, 'ferie': d.ferie, 'malattia': d.malattia, 'preferenze_turno': sorted(preferenze_obbligatorie(d))} for d in Dipendente.query.all()])

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
            # ── Migrazione Giustina: rimuovi vecchi admin e dipendenti obsoleti ──
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
