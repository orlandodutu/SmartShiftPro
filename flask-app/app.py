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


class RichiestaScambio(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    richiedente_id = db.Column(db.Integer, db.ForeignKey('dipendente.id'), nullable=False)
    destinatario_id = db.Column(db.Integer, db.ForeignKey('dipendente.id'), nullable=False)
    turno_richiedente_id = db.Column(db.Integer, db.ForeignKey('turno.id'), nullable=False)
    turno_destinatario_id = db.Column(db.Integer, db.ForeignKey('turno.id'), nullable=False)
    stato = db.Column(db.String(20), default='IN_ATTESA')
    nota = db.Column(db.String(300), default='')
    nota_caposala = db.Column(db.String(300), default='')
    creata_il = db.Column(db.String(20), default='')

    richiedente = db.relationship('Dipendente', foreign_keys=[richiedente_id])
    destinatario = db.relationship('Dipendente', foreign_keys=[destinatario_id])
    turno_richiedente = db.relationship('Turno', foreign_keys=[turno_richiedente_id])
    turno_destinatario = db.relationship('Turno', foreign_keys=[turno_destinatario_id])

    def to_dict(self):
        return {
            'id': self.id,
            'richiedente_id': self.richiedente_id,
            'richiedente_nome': self.richiedente.nome,
            'richiedente_ruolo': self.richiedente.ruolo,
            'destinatario_id': self.destinatario_id,
            'destinatario_nome': self.destinatario.nome,
            'destinatario_ruolo': self.destinatario.ruolo,
            'turno_richiedente': self.turno_richiedente.to_dict() if self.turno_richiedente else None,
            'turno_destinatario': self.turno_destinatario.to_dict() if self.turno_destinatario else None,
            'stato': self.stato,
            'nota': self.nota,
            'nota_caposala': self.nota_caposala,
            'creata_il': self.creata_il
        }


# --- INIZIALIZZAZIONE STAFF ---

def inizializza_staff():
    staff_nomi = [
        ("Orlando", "DEV", True),
        ("Fabiana", "AUSILIARIO", False),
        ("Marina", "AUSILIARIO", False),
        ("Angela", "AUSILIARIO", False),
        ("Carmen", "OSS", False),
        ("Roberto", "OSS", False),
        ("Barbara", "OSS", False),
        ("Vittoria", "OSS", False),
        ("Stefania 2", "OSS", False),
        ("Anna", "INFERMIERA", False),
        ("Stefania", "OSS", False),
        ("Ioana", "OSS", False),
        ("Elena", "OSS", False),
        ("Caposala", "CAPOSALA", True),
    ]
    if Dipendente.query.first() is None:
        for nome, ruolo, is_admin in staff_nomi:
            pw = 'caposala123' if ruolo == 'CAPOSALA' else 'password123'
            nuovo = Dipendente(nome=nome, ruolo=ruolo, is_admin=is_admin, password=pw)
            db.session.add(nuovo)
        db.session.commit()
        print("Staff caricato!")
    else:
        # Ensure Caposala exists
        if not Dipendente.query.filter_by(ruolo='CAPOSALA').first():
            caposala = Dipendente(nome='Caposala', ruolo='CAPOSALA', is_admin=True, password='caposala123')
            db.session.add(caposala)
            db.session.commit()
            print("Caposala aggiunto!")


# ==========================================
# BLUEPRINT ROUTES — served at /flask-api/api/...
# ==========================================

@api.route('/api/login', methods=['POST'])
def login():
    data = request.json
    username = str(data.get('username', ''))[:50]
    password = str(data.get('password', ''))[:100]
    user = Dipendente.query.filter_by(nome=username, password=password).first()
    if user:
        session['user_id'] = user.id
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        user.last_login = now
        user.last_seen = now
        db.session.commit()
        return jsonify(user.to_dict(include_phone=True) | {'success': True})
    return jsonify({'errore': 'Credenziali errate'}), 401


@api.route('/api/change_password', methods=['POST'])
def change_password():
    if 'user_id' not in session:
        return jsonify({'errore': 'Non autenticato'}), 401
    user = db.session.get(Dipendente, session['user_id'])
    if not user:
        return jsonify({'errore': 'Utente non trovato'}), 404
    data = request.json
    new_pw = str(data.get('new_password', ''))[:100].strip()
    if len(new_pw) < 6:
        return jsonify({'errore': 'La password deve essere di almeno 6 caratteri'}), 400
    telefono_raw = str(data.get('telefono', '')).strip().replace(' ', '').replace('-', '')
    for prefix in ('+39', '0039'):
        if telefono_raw.startswith(prefix):
            telefono_raw = telefono_raw[len(prefix):]
            break
    if telefono_raw:
        user.telefono = telefono_raw[:15]
    user.password = new_pw
    user.password_changed = True
    db.session.commit()
    return jsonify(user.to_dict(include_phone=True))


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
    user.last_seen = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    db.session.commit()
    return jsonify(user.to_dict(include_phone=True))


@api.route('/api/online', methods=['GET'])
def get_online():
    if 'user_id' not in session:
        return jsonify({'errore': 'Non autenticato'}), 401
    me = db.session.get(Dipendente, session['user_id'])
    if not me or not me.is_admin:
        return jsonify({'errore': 'Non autorizzato'}), 403
    utenti = Dipendente.query.order_by(Dipendente.last_seen.desc()).all()
    # Super-admin entries are invisible to non-super-admin viewers (future-proofing)
    if not me.is_admin:
        utenti = [u for u in utenti if not u.is_admin]
    return jsonify([u.to_dict(include_phone=True) for u in utenti])


@api.route('/api/scambi/count', methods=['GET'])
def get_scambi_count():
    if 'user_id' not in session:
        return jsonify({'errore': 'Non autenticato'}), 401
    me = db.session.get(Dipendente, session['user_id'])
    if not me or not (me.is_admin or me.ruolo == 'CAPOSALA'):
        return jsonify({'errore': 'Non autorizzato'}), 403
    count = RichiestaScambio.query.filter_by(stato='IN_ATTESA').count()
    return jsonify({'count': count})


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
    nuovo = Dipendente(
        nome=nome,
        ruolo=ruolo,
        password='password123',
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
    # Cascade: remove turni, scambi, assenze
    Turno.query.filter_by(dipendente_id=id).delete()
    RichiestaScambio.query.filter(
        (RichiestaScambio.richiedente_id == id) |
        (RichiestaScambio.destinatario_id == id)
    ).delete(synchronize_session=False)
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
    db.session.commit()
    return jsonify(assenza.to_dict()), 201


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
    db.session.delete(assenza)
    db.session.commit()
    return jsonify({'success': True})


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


@api.route('/api/turni/<int:id>', methods=['PUT'])
def modifica_turno(id):
    if 'user_id' not in session:
        return jsonify({'errore': 'Non autenticato'}), 401
    richiedente = db.session.get(Dipendente, session['user_id'])
    if not richiedente or not richiedente.is_admin:
        return jsonify({'errore': 'Non autorizzato — solo admin'}), 403
    turno = db.session.get(Turno, id)
    if not turno:
        return jsonify({'errore': 'Turno non trovato'}), 404
    data = request.json
    old_dip_id = turno.dipendente_id
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
    db.session.commit()
    _ricalcola_statistiche(old_dip_id)
    if turno.dipendente_id != old_dip_id:
        _ricalcola_statistiche(turno.dipendente_id)
    return jsonify(turno.to_dict())


@api.route('/api/turni/<int:id>', methods=['DELETE'])
def elimina_turno(id):
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


@api.route('/api/statistiche', methods=['GET'])
def statistiche():
    dipendenti = Dipendente.query.all()
    return jsonify([{
        'id': d.id, 'nome': d.nome, 'ruolo': d.ruolo,
        'ore_totali': d.ore_totali, 'notti_fatte': d.notti_fatte,
        'ferie': d.ferie, 'malattia': d.malattia
    } for d in dipendenti])


def _genera_interno(data_inizio_str, giorni):
    """Core shift generation logic. Called by both genera_turni and genera_giorno."""
    ORE_MAP = {'MATTINO': 7, 'POMERIGGIO': 7, 'NOTTE': 10, 'SMONTO': 0, 'RIPOSO': 0, 'FERIE': 0, 'MALATTIA': 0}
    AUSILIARIO_ORE = 8
    AUSILIARIO_ORARI = {'Marina': '07:00', 'Fabiana': '07:00', 'Angela': '08:00'}

    try:
        data_inizio = datetime.strptime(data_inizio_str, '%Y-%m-%d').date()
    except Exception:
        data_inizio = date.today()

    all_dip = Dipendente.query.order_by(Dipendente.nome).all()

    # Night-eligible = 'NOTTE' in their preferenze_turno field
    def is_notte_eligible(d):
        return 'NOTTE' in (d.preferenze_turno or 'MATTINO,POMERIGGIO').split(',')

    # Separate groups (admin excluded from role-based groups)
    admin_staff = [d for d in all_dip if d.is_admin]
    infermieri  = [d for d in all_dip if d.ruolo == 'INFERMIERA' and not d.is_admin]
    all_oss     = [d for d in all_dip if d.ruolo == 'OSS'        and not d.is_admin]
    oss_notturni = [d for d in all_oss if is_notte_eligible(d)]
    ausiliari   = [d for d in all_dip if d.ruolo == 'AUSILIARIO' and not d.is_admin]

    if not all_dip:
        return None, 'Nessun dipendente trovato'

    generati = 0
    saltati  = 0

    for i in range(giorni):
        giorno   = data_inizio + timedelta(days=i)
        data_str = giorno.strftime('%Y-%m-%d')
        ieri_str = (giorno - timedelta(days=1)).strftime('%Y-%m-%d')
        weekday  = giorno.weekday()  # 0=Mon…6=Sun

        # IDs with any existing shift today (manuale or not)
        gia = {t.dipendente_id for t in Turno.query.filter_by(data=data_str).all()}

        # Active absences for this day
        assenze_oggi = Assenza.query.filter(
            Assenza.data_inizio <= data_str,
            Assenza.data_fine   >= data_str
        ).all()
        assenti_ids = {a.dipendente_id for a in assenze_oggi}

        # Night-chain tracking from yesterday
        notte_ieri  = {t.dipendente_id for t in Turno.query.filter_by(data=ieri_str, tipo='NOTTE').all()}
        smonto_ieri = {t.dipendente_id for t in Turno.query.filter_by(data=ieri_str, tipo='SMONTO').all()}

        def crea(dip, tipo, ore_override=None, ora_inizio=''):
            nonlocal generati, saltati
            if dip.id in gia:
                saltati += 1
                return False
            ore = ore_override if ore_override is not None else ORE_MAP.get(tipo, 0)
            t = Turno(dipendente_id=dip.id, data=data_str, tipo=tipo, ore=ore, note='Auto', manuale=False, ora_inizio=ora_inizio)
            db.session.add(t)
            gia.add(dip.id)
            if dip.ruolo != 'CAPOSALA':
                dip.ore_totali += ore
            if tipo == 'NOTTE':    dip.notti_fatte += 1
            elif tipo == 'FERIE':  dip.ferie       += 1
            elif tipo == 'MALATTIA': dip.malattia  += 1
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
        for dip in infermieri:
            if dip.id in gia: continue
            if weekday == 6:
                crea(dip, 'RIPOSO')
            elif weekday == 5 and (i // 7) % 2 == 0:
                crea(dip, 'RIPOSO')
            else:
                crea(dip, 'MATTINO', 7)

        # ── 3. OSS Night chain: SMONTO and RIPOSO from yesterday ──
        for dip in all_oss:
            if dip.id in gia: continue
            if dip.id in notte_ieri:
                crea(dip, 'SMONTO')
            elif dip.id in smonto_ieri:
                crea(dip, 'RIPOSO')

        # Assign tonight's NOTTE: 1 night-eligible OSS not yet assigned
        for offset in range(len(oss_notturni)):
            candidate = oss_notturni[(i + offset) % len(oss_notturni)]
            if candidate.id not in gia and candidate.id not in assenti_ids:
                crea(candidate, 'NOTTE')
                break

        # ── 4. Remaining OSS: M≥3, P≥2, rest RIPOSO ──
        n = len(all_oss)
        oss_liberi = sorted(
            [d for d in all_oss if d.id not in gia and d.id not in assenti_ids],
            key=lambda d: (all_oss.index(d) + i) % n if n else 0
        )
        m_c = p_c = 0
        for dip in oss_liberi:
            if m_c < 3:
                crea(dip, 'MATTINO');  m_c += 1
            elif p_c < 2:
                crea(dip, 'POMERIGGIO'); p_c += 1
            else:
                crea(dip, 'RIPOSO')

        # ── 5. Ausiliari: 07–15 (8h), separate from OSS, min 1/day ──
        aus_libere = [d for d in ausiliari if d.id not in gia and d.id not in assenti_ids]
        n_aus = len(ausiliari)
        aus_in_turno = 0
        for idx, dip in enumerate(aus_libere):
            orig_idx = ausiliari.index(dip)
            slot = (orig_idx + i) % n_aus if n_aus > 0 else 0
            should_work = slot < (n_aus - 1) if n_aus > 1 else True
            if aus_in_turno == 0 and idx == len(aus_libere) - 1:
                should_work = True
            if should_work:
                ora = AUSILIARIO_ORARI.get(dip.nome, '07:00')
                crea(dip, 'MATTINO', AUSILIARIO_ORE, ora_inizio=ora)
                aus_in_turno += 1
            else:
                crea(dip, 'RIPOSO')

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
    # Delete ALL shifts and swap requests and absences
    RichiestaScambio.query.delete()
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
    if not richiedente or not richiedente.is_admin:
        return jsonify({'errore': 'Non autorizzato — solo admin'}), 403
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


@api.route('/api/scambi', methods=['GET'])
def get_scambi():
    stato = request.args.get('stato')
    richiedente_id = request.args.get('richiedente_id')
    destinatario_id = request.args.get('destinatario_id')
    query = RichiestaScambio.query
    if stato: query = query.filter_by(stato=stato)
    if richiedente_id: query = query.filter_by(richiedente_id=richiedente_id)
    if destinatario_id: query = query.filter_by(destinatario_id=destinatario_id)
    return jsonify([s.to_dict() for s in query.order_by(RichiestaScambio.id.desc()).all()])


@api.route('/api/scambi', methods=['POST'])
def richiedi_scambio():
    data = request.json
    richiedente_id = data.get('richiedente_id')
    destinatario_id = data.get('destinatario_id')
    turno_richiedente_id = data.get('turno_richiedente_id')
    turno_destinatario_id = data.get('turno_destinatario_id')

    if richiedente_id == destinatario_id:
        return jsonify({'errore': 'Non puoi scambiare turni con te stesso'}), 400

    turno_r = Turno.query.get(turno_richiedente_id)
    turno_d = Turno.query.get(turno_destinatario_id)
    if not turno_r or not turno_d:
        return jsonify({'errore': 'Turno non trovato'}), 404
    if turno_r.dipendente_id != richiedente_id:
        return jsonify({'errore': 'Il turno non appartiene al richiedente'}), 400
    if turno_d.dipendente_id != destinatario_id:
        return jsonify({'errore': 'Il turno non appartiene al destinatario'}), 400

    esistente = RichiestaScambio.query.filter_by(
        turno_richiedente_id=turno_richiedente_id, stato='IN_ATTESA'
    ).first()
    if esistente:
        return jsonify({'errore': 'Esiste già una richiesta pendente per questo turno'}), 400

    richiesta = RichiestaScambio(
        richiedente_id=richiedente_id,
        destinatario_id=destinatario_id,
        turno_richiedente_id=turno_richiedente_id,
        turno_destinatario_id=turno_destinatario_id,
        nota=data.get('nota', ''),
        creata_il=datetime.now().strftime('%Y-%m-%d %H:%M')
    )
    db.session.add(richiesta)
    db.session.commit()
    return jsonify(richiesta.to_dict()), 201


@api.route('/api/scambi/<int:id>/approva', methods=['POST'])
def approva_scambio(id):
    richiesta = RichiestaScambio.query.get_or_404(id)
    data = request.json
    azione = data.get('azione')
    nota_caposala = data.get('nota_caposala', '')

    if richiesta.stato != 'IN_ATTESA':
        return jsonify({'errore': 'Richiesta già gestita'}), 400

    if azione == 'approva':
        richiesta.stato = 'APPROVATA'
        richiesta.nota_caposala = nota_caposala
        turno_r = richiesta.turno_richiedente
        turno_d = richiesta.turno_destinatario
        tipo_temp, ore_temp = turno_r.tipo, turno_r.ore
        turno_r.tipo, turno_r.ore = turno_d.tipo, turno_d.ore
        turno_d.tipo, turno_d.ore = tipo_temp, ore_temp
        _ricalcola_statistiche(richiesta.richiedente_id)
        _ricalcola_statistiche(richiesta.destinatario_id)
    elif azione == 'rifiuta':
        richiesta.stato = 'RIFIUTATA'
        richiesta.nota_caposala = nota_caposala
    else:
        return jsonify({'errore': 'Azione non valida'}), 400

    db.session.commit()
    return jsonify(richiesta.to_dict())


@api.route('/api/scambi/<int:id>', methods=['DELETE'])
def annulla_scambio(id):
    richiesta = RichiestaScambio.query.get_or_404(id)
    if richiesta.stato != 'IN_ATTESA':
        return jsonify({'errore': 'Solo richieste in attesa possono essere annullate'}), 400
    db.session.delete(richiesta)
    db.session.commit()
    return jsonify({'success': True})


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
    preferenze = request.json.get('preferenze', ['MATTINO', 'POMERIGGIO', 'NOTTE'])
    valide = [p for p in preferenze if p in ('MATTINO', 'POMERIGGIO', 'NOTTE')]
    dip.preferenze_turno = ','.join(valide) if valide else 'MATTINO,POMERIGGIO,NOTTE'
    db.session.commit()
    return jsonify(dip.to_dict())


@api.route('/api/manifest.json', methods=['GET'])
def manifest():
    return send_file(os.path.join(BASE_DIR, 'manifest.json'), mimetype='application/manifest+json')


@api.route('/api/genera_report_mensile', methods=['GET'])
def genera_pdf():
    mese = request.args.get('mese', str(datetime.now().month))
    anno = request.args.get('anno', str(datetime.now().year))
    nome_mesi = ['', 'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
                 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']
    prefix = f"{anno}-{mese.zfill(2)}"

    # Permission check: admin and Caposala get the full report, others get only their own
    user_id = session.get('user_id')
    me = db.session.get(Dipendente, user_id) if user_id else None
    is_privileged = me and (me.is_admin or me.ruolo == 'CAPOSALA')
    if not me:
        return jsonify({'errore': 'Non autenticato'}), 401

    turni_query = Turno.query.filter(Turno.data.like(f"{prefix}%")).order_by(Turno.data)
    if not is_privileged:
        turni_query = turni_query.filter(Turno.dipendente_id == user_id)
    turni = turni_query.all()

    report_title = (
        f"Report Turni - {nome_mesi[int(mese)]} {anno}"
        if is_privileged
        else f"Report Personale - {me.nome} - {nome_mesi[int(mese)]} {anno}"
    )

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=30, bottomMargin=30)
    styles = getSampleStyleSheet()
    elements = [
        Paragraph(report_title, styles['Title']),
        Spacer(1, 20)
    ]
    if turni:
        data_table = [['Data', 'Dipendente', 'Ruolo', 'Turno', 'Ore', 'Note']]
        for t in turni:
            data_table.append([t.data, t.dipendente.nome, t.dipendente.ruolo, t.tipo, str(t.ore), t.note or ''])
        table = Table(data_table, colWidths=[70, 100, 80, 80, 40, 100])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a3a6b')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f0f4ff')]),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        elements.append(table)
    else:
        elements.append(Paragraph("Nessun turno registrato per questo mese.", styles['Normal']))

    elements.append(Spacer(1, 30))
    elements.append(Paragraph("Riepilogo", styles['Heading2']))
    elements.append(Spacer(1, 10))
    if is_privileged:
        dip_list = Dipendente.query.order_by(Dipendente.ruolo).all()
    else:
        dip_list = [me]
    riepilogo = [['Dipendente', 'Ruolo', 'Ore', 'Notti', 'Ferie', 'Malattia']]
    for d in dip_list:
        riepilogo.append([d.nome, d.ruolo, str(d.ore_totali), str(d.notti_fatte), str(d.ferie), str(d.malattia)])
    rt = Table(riepilogo, colWidths=[100, 80, 70, 60, 60, 70])
    rt.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a3a6b')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f0f4ff')]),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(rt)
    doc.build(elements)
    buffer.seek(0)
    filename = f"report_{nome_mesi[int(mese)]}_{anno}.pdf"
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


if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        # Migrations for new columns and data
        from sqlalchemy import text, inspect as sa_inspect
        try:
            inspector = sa_inspect(db.engine)
            cols = [c['name'] for c in inspector.get_columns('dipendente')]
            with db.engine.connect() as conn:
                for col, coldef in [
                    ('preferenze_turno', "VARCHAR(100) DEFAULT 'MATTINO,POMERIGGIO,NOTTE'"),
                    ('password_changed', 'BOOLEAN DEFAULT 0'),
                    ('last_login', "VARCHAR(20) DEFAULT ''"),
                    ('last_seen', "VARCHAR(20) DEFAULT ''"),
                    ('telefono', "VARCHAR(20) DEFAULT ''"),
                ]:
                    if col not in cols:
                        conn.execute(text(f"ALTER TABLE dipendente ADD COLUMN {col} {coldef}"))
                # Migrate turno table
                turno_cols = [c['name'] for c in inspector.get_columns('turno')]
                if 'manuale' not in turno_cols:
                    conn.execute(text("ALTER TABLE turno ADD COLUMN manuale BOOLEAN DEFAULT 0"))
                if 'ora_inizio' not in turno_cols:
                    conn.execute(text("ALTER TABLE turno ADD COLUMN ora_inizio VARCHAR(5) DEFAULT ''"))
                if 'archivio_mese' not in turno_cols:
                    conn.execute(text("ALTER TABLE turno ADD COLUMN archivio_mese VARCHAR(7) DEFAULT ''"))
                # Rename PULIZIE → AUSILIARIO
                conn.execute(text("UPDATE dipendente SET ruolo='AUSILIARIO' WHERE ruolo='PULIZIE'"))
                conn.commit()
        except Exception:
            pass
        # Ensure assenza table exists
        db.create_all()
        inizializza_staff()
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
