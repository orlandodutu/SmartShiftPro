from flask import Flask, jsonify, request, send_file, render_template, session, redirect, url_for
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
import io
import os
from datetime import datetime, date
import json

app = Flask(__name__)
app.secret_key = os.environ.get('SESSION_SECRET', 'turni-segreto-2024')
CORS(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = f"sqlite:///{os.path.join(BASE_DIR, 'gestione_turni.db')}"
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)


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
    data = db.Column(db.String(10), nullable=False)  # YYYY-MM-DD
    tipo = db.Column(db.String(20), nullable=False)  # MATTINO, POMERIGGIO, NOTTE, FERIE, MALATTIA, RIPOSO
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
    ]
    if Dipendente.query.first() is None:
        for nome, ruolo, is_admin in staff_nomi:
            nuovo = Dipendente(nome=nome, ruolo=ruolo, is_admin=is_admin)
            db.session.add(nuovo)
        db.session.commit()
        print("Database creato e staff caricato!")


# --- ROTTE FRONTEND ---

@app.route('/')
def index():
    if 'user_id' not in session:
        return redirect(url_for('login_page'))
    return redirect(url_for('dashboard'))


@app.route('/login')
def login_page():
    return render_template('login.html')


@app.route('/dashboard')
def dashboard():
    if 'user_id' not in session:
        return redirect(url_for('login_page'))
    user = Dipendente.query.get(session['user_id'])
    if not user:
        session.clear()
        return redirect(url_for('login_page'))
    return render_template('dashboard.html', user=user)


@app.route('/turni')
def turni_page():
    if 'user_id' not in session:
        return redirect(url_for('login_page'))
    user = Dipendente.query.get(session['user_id'])
    return render_template('turni.html', user=user)


@app.route('/staff')
def staff_page():
    if 'user_id' not in session:
        return redirect(url_for('login_page'))
    user = Dipendente.query.get(session['user_id'])
    if not user.is_admin:
        return redirect(url_for('dashboard'))
    return render_template('staff.html', user=user)


# --- API ROTTE ---

@app.route('/api/login', methods=['POST'])
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


@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True})


@app.route('/api/me', methods=['GET'])
def me():
    if 'user_id' not in session:
        return jsonify({'errore': 'Non autenticato'}), 401
    user = Dipendente.query.get(session['user_id'])
    if not user:
        return jsonify({'errore': 'Utente non trovato'}), 404
    return jsonify(user.to_dict())


@app.route('/api/dipendenti', methods=['GET'])
def get_dipendenti():
    dipendenti = Dipendente.query.order_by(Dipendente.ruolo, Dipendente.nome).all()
    return jsonify([d.to_dict() for d in dipendenti])


@app.route('/api/dipendenti', methods=['POST'])
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


@app.route('/api/dipendenti/<int:id>', methods=['PUT'])
def aggiorna_dipendente(id):
    d = Dipendente.query.get_or_404(id)
    data = request.json
    if 'ruolo' in data:
        d.ruolo = data['ruolo']
    if 'password' in data:
        d.password = data['password']
    if 'ferie' in data:
        d.ferie = data['ferie']
    if 'malattia' in data:
        d.malattia = data['malattia']
    db.session.commit()
    return jsonify(d.to_dict())


@app.route('/api/dipendenti/<int:id>', methods=['DELETE'])
def elimina_dipendente(id):
    d = Dipendente.query.get_or_404(id)
    Turno.query.filter_by(dipendente_id=id).delete()
    db.session.delete(d)
    db.session.commit()
    return jsonify({'success': True})


@app.route('/api/turni', methods=['GET'])
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


@app.route('/api/turni', methods=['POST'])
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

    # Aggiorna statistiche dipendente
    dip = Dipendente.query.get(data['dipendente_id'])
    if dip:
        dip.ore_totali += ore
        if data['tipo'] == 'NOTTE':
            dip.notti_fatte += 1
        elif data['tipo'] == 'FERIE':
            dip.ferie += 1
        elif data['tipo'] == 'MALATTIA':
            dip.malattia += 1

    db.session.commit()
    return jsonify(turno.to_dict()), 201


@app.route('/api/turni/<int:id>', methods=['DELETE'])
def elimina_turno(id):
    turno = Turno.query.get_or_404(id)

    # Ripristina statistiche
    dip = turno.dipendente
    if dip:
        dip.ore_totali = max(0, dip.ore_totali - turno.ore)
        if turno.tipo == 'NOTTE':
            dip.notti_fatte = max(0, dip.notti_fatte - 1)
        elif turno.tipo == 'FERIE':
            dip.ferie = max(0, dip.ferie - 1)
        elif turno.tipo == 'MALATTIA':
            dip.malattia = max(0, dip.malattia - 1)

    db.session.delete(turno)
    db.session.commit()
    return jsonify({'success': True})


@app.route('/api/statistiche', methods=['GET'])
def statistiche():
    dipendenti = Dipendente.query.all()
    result = []
    for d in dipendenti:
        result.append({
            'nome': d.nome,
            'ruolo': d.ruolo,
            'ore_totali': d.ore_totali,
            'notti_fatte': d.notti_fatte,
            'ferie': d.ferie,
            'malattia': d.malattia
        })
    return jsonify(result)


@app.route('/api/genera_report_mensile', methods=['GET'])
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
    elements = []

    # Titolo
    title_style = styles['Title']
    elements.append(Paragraph(f"Report Turni - {nome_mesi[int(mese)]} {anno}", title_style))
    elements.append(Spacer(1, 20))

    # Tabella turni
    if turni:
        data_table = [['Data', 'Dipendente', 'Ruolo', 'Turno', 'Ore', 'Note']]
        for t in turni:
            data_table.append([
                t.data,
                t.dipendente.nome,
                t.dipendente.ruolo,
                t.tipo,
                str(t.ore),
                t.note or ''
            ])

        table = Table(data_table, colWidths=[70, 100, 80, 80, 40, 100])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a56db')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f0f4ff')]),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        elements.append(table)
    else:
        elements.append(Paragraph("Nessun turno registrato per questo mese.", styles['Normal']))

    elements.append(Spacer(1, 30))

    # Riepilogo per dipendente
    elements.append(Paragraph("Riepilogo Mensile per Dipendente", styles['Heading2']))
    elements.append(Spacer(1, 10))

    dipendenti = Dipendente.query.order_by(Dipendente.ruolo).all()
    riepilogo_data = [['Dipendente', 'Ruolo', 'Ore Totali', 'Notti', 'Ferie', 'Malattia']]
    for d in dipendenti:
        riepilogo_data.append([d.nome, d.ruolo, str(d.ore_totali), str(d.notti_fatte), str(d.ferie), str(d.malattia)])

    riepilogo_table = Table(riepilogo_data, colWidths=[100, 80, 70, 60, 60, 70])
    riepilogo_table.setStyle(TableStyle([
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
    elements.append(riepilogo_table)

    doc.build(elements)
    buffer.seek(0)

    filename = f"report_{nome_mesi[int(mese)]}_{anno}.pdf"
    return send_file(buffer, as_attachment=True, download_name=filename, mimetype='application/pdf')


if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        inizializza_staff()
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
