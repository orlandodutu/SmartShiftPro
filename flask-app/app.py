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
app.config['SQLALCHEMY_DATABASE_URI'] = f"sqlite:///{os.path.join(BASE_DIR, 'gestione_turni.db')}"
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

    def to_dict(self):
        return {
            'id': self.id,
            'nome': self.nome,
            'ruolo': self.ruolo,
            'ore_totali': self.ore_totali,
            'notti_fatte': self.notti_fatte,
            'ferie': self.ferie,
            'malattia': self.malattia,
            'is_admin': self.is_admin
        }


class Turno(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    dipendente_id = db.Column(db.Integer, db.ForeignKey('dipendente.id'), nullable=False)
    data = db.Column(db.String(10), nullable=False)
    tipo = db.Column(db.String(20), nullable=False)
    ore = db.Column(db.Integer, default=8)
    note = db.Column(db.String(200), default='')
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
            'note': self.note
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
        ("Fabiana", "PULIZIE", False),
        ("Marina", "PULIZIE", False),
        ("Angela", "PULIZIE", False),
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
    user = Dipendente.query.filter_by(
        nome=data.get('username'),
        password=data.get('password')
    ).first()
    if user:
        session['user_id'] = user.id
        return jsonify({
            'success': True,
            'id': user.id,
            'nome': user.nome,
            'ruolo': user.ruolo,
            'is_admin': user.is_admin,
            'stats': {
                'ore': user.ore_totali,
                'notti': user.notti_fatte,
                'ferie': user.ferie,
                'malattia': user.malattia
            }
        })
    return jsonify({'errore': 'Credenziali errate'}), 401


@api.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True})


@api.route('/api/me', methods=['GET'])
def me():
    if 'user_id' not in session:
        return jsonify({'errore': 'Non autenticato'}), 401
    user = Dipendente.query.get(session['user_id'])
    if not user:
        return jsonify({'errore': 'Utente non trovato'}), 404
    return jsonify(user.to_dict())


@api.route('/api/dipendenti', methods=['GET'])
def get_dipendenti():
    dipendenti = Dipendente.query.order_by(Dipendente.ruolo, Dipendente.nome).all()
    return jsonify([d.to_dict() for d in dipendenti])


@api.route('/api/dipendenti', methods=['POST'])
def aggiungi_dipendente():
    data = request.json
    if Dipendente.query.filter_by(nome=data['nome']).first():
        return jsonify({'errore': 'Nome già esistente'}), 400
    nuovo = Dipendente(
        nome=data['nome'],
        ruolo=data['ruolo'],
        password=data.get('password', 'password123')
    )
    db.session.add(nuovo)
    db.session.commit()
    return jsonify(nuovo.to_dict()), 201


@api.route('/api/dipendenti/<int:id>', methods=['PUT'])
def aggiorna_dipendente(id):
    d = Dipendente.query.get_or_404(id)
    data = request.json
    for field in ['ruolo', 'password', 'ferie', 'malattia']:
        if field in data:
            setattr(d, field, data[field])
    db.session.commit()
    return jsonify(d.to_dict())


@api.route('/api/dipendenti/<int:id>', methods=['DELETE'])
def elimina_dipendente(id):
    d = Dipendente.query.get_or_404(id)
    Turno.query.filter_by(dipendente_id=id).delete()
    db.session.delete(d)
    db.session.commit()
    return jsonify({'success': True})


@api.route('/api/turni', methods=['GET'])
def get_turni():
    mese = request.args.get('mese')
    anno = request.args.get('anno')
    dipendente_id = request.args.get('dipendente_id')

    query = Turno.query
    if mese and anno:
        prefix = f"{anno}-{mese.zfill(2)}"
        query = query.filter(Turno.data.like(f"{prefix}%"))
    if dipendente_id:
        query = query.filter_by(dipendente_id=dipendente_id)

    turni = query.order_by(Turno.data).all()
    return jsonify([t.to_dict() for t in turni])


@api.route('/api/turni', methods=['POST'])
def aggiungi_turno():
    data = request.json
    ore_map = {'MATTINO': 7, 'POMERIGGIO': 7, 'NOTTE': 10, 'FERIE': 0, 'MALATTIA': 0, 'RIPOSO': 0}
    ore = ore_map.get(data.get('tipo', 'MATTINO'), 8)
    turno = Turno(
        dipendente_id=data['dipendente_id'],
        data=data['data'],
        tipo=data['tipo'],
        ore=ore,
        note=data.get('note', '')
    )
    db.session.add(turno)
    dip = Dipendente.query.get(data['dipendente_id'])
    if dip:
        dip.ore_totali += ore
        if data['tipo'] == 'NOTTE': dip.notti_fatte += 1
        elif data['tipo'] == 'FERIE': dip.ferie += 1
        elif data['tipo'] == 'MALATTIA': dip.malattia += 1
    db.session.commit()
    return jsonify(turno.to_dict()), 201


@api.route('/api/turni/<int:id>', methods=['DELETE'])
def elimina_turno(id):
    turno = Turno.query.get_or_404(id)
    dip = turno.dipendente
    if dip:
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


@api.route('/api/turni/genera', methods=['POST'])
def genera_turni():
    data = request.json
    modalita = data.get('modalita', 'settimana')
    data_inizio_str = data.get('data_inizio')
    try:
        data_inizio = datetime.strptime(data_inizio_str, '%Y-%m-%d').date()
    except Exception:
        data_inizio = date.today()

    giorni = 7 if modalita == 'settimana' else 30
    dipendenti = Dipendente.query.filter(
        Dipendente.ruolo.in_(['OSS', 'INFERMIERA', 'PULIZIE'])
    ).all()

    if not dipendenti:
        return jsonify({'errore': 'Nessun dipendente trovato'}), 400

    tipi_turno = ['MATTINO', 'POMERIGGIO', 'NOTTE', 'RIPOSO']
    ore_map = {'MATTINO': 7, 'POMERIGGIO': 7, 'NOTTE': 10, 'RIPOSO': 0}
    generati = 0
    saltati = 0

    for i in range(giorni):
        giorno = data_inizio + timedelta(days=i)
        data_str = giorno.strftime('%Y-%m-%d')
        turni_esistenti = {t.dipendente_id for t in Turno.query.filter_by(data=data_str).all()}

        for idx, dip in enumerate(dipendenti):
            if dip.id in turni_esistenti:
                saltati += 1
                continue
            offset = (idx + i) % len(tipi_turno)
            tipo = 'RIPOSO' if giorno.weekday() == 6 and idx % 2 == 0 else tipi_turno[offset]
            ore = ore_map[tipo]
            turno = Turno(dipendente_id=dip.id, data=data_str, tipo=tipo, ore=ore, note='Auto-generato')
            db.session.add(turno)
            dip.ore_totali += ore
            if tipo == 'NOTTE': dip.notti_fatte += 1
            generati += 1

    db.session.commit()
    return jsonify({'success': True, 'generati': generati, 'saltati': saltati, 'modalita': modalita, 'giorni': giorni})


@api.route('/api/genera_programmazione', methods=['POST'])
def genera_programmazione():
    return genera_turni()


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
    turni = Turno.query.filter(Turno.data.like(f"{prefix}%")).order_by(Turno.data).all()
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=30, bottomMargin=30)
    styles = getSampleStyleSheet()
    elements = [
        Paragraph(f"Report Turni - {nome_mesi[int(mese)]} {anno}", styles['Title']),
        Spacer(1, 20)
    ]
    if turni:
        data_table = [['Data', 'Dipendente', 'Ruolo', 'Turno', 'Ore', 'Note']]
        for t in turni:
            data_table.append([t.data, t.dipendente.nome, t.dipendente.ruolo, t.tipo, str(t.ore), t.note or ''])
        table = Table(data_table, colWidths=[70, 100, 80, 80, 40, 100])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a56db')),
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
    elements.append(Paragraph("Riepilogo per Dipendente", styles['Heading2']))
    elements.append(Spacer(1, 10))
    dipendenti = Dipendente.query.order_by(Dipendente.ruolo).all()
    riepilogo = [['Dipendente', 'Ruolo', 'Ore', 'Notti', 'Ferie', 'Malattia']]
    for d in dipendenti:
        riepilogo.append([d.nome, d.ruolo, str(d.ore_totali), str(d.notti_fatte), str(d.ferie), str(d.malattia)])
    rt = Table(riepilogo, colWidths=[100, 80, 70, 60, 60, 70])
    rt.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a56db')),
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
    if dip:
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
    if dip:
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
        inizializza_staff()
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
