import os, json
from datetime import datetime
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from flask_mail import Mail, Message
from functools import wraps

BASE = os.path.dirname(__file__)
STATIC_DATA = os.path.join(BASE, 'instance', 'strategic_data.json')

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'pnfb-crm-secret-2026-change-in-prod')

# PostgreSQL en production, SQLite en local
_db_url = os.environ.get('DATABASE_URL', '')
# Fallback : Railway expose aussi PGHOST/PGUSER/PGPASSWORD/PGDATABASE/PGPORT
if not _db_url and os.environ.get('PGHOST'):
    _pg_user = os.environ.get('PGUSER', 'postgres')
    _pg_pass = os.environ.get('PGPASSWORD', '')
    _pg_host = os.environ.get('PGHOST', 'localhost')
    _pg_port = os.environ.get('PGPORT', '5432')
    _pg_db   = os.environ.get('PGDATABASE', 'railway')
    _db_url = f"postgresql://{_pg_user}:{_pg_pass}@{_pg_host}:{_pg_port}/{_pg_db}"
if not _db_url:
    _db_url = f"sqlite:///{os.path.join(BASE, 'instance', 'crm.db')}"
if _db_url.startswith('postgres://'):
    _db_url = _db_url.replace('postgres://', 'postgresql://', 1)
app.config['SQLALCHEMY_DATABASE_URI'] = _db_url
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_SECURE'] = os.environ.get('FLASK_ENV') == 'production'

# Email
app.config['MAIL_SERVER']         = os.environ.get('MAIL_SERVER', 'smtp.gmail.com')
app.config['MAIL_PORT']           = int(os.environ.get('MAIL_PORT', 587))
app.config['MAIL_USE_TLS']        = True
app.config['MAIL_USERNAME']       = os.environ.get('MAIL_USERNAME', '')
app.config['MAIL_PASSWORD']       = os.environ.get('MAIL_PASSWORD', '')
app.config['MAIL_DEFAULT_SENDER'] = os.environ.get('MAIL_DEFAULT_SENDER', os.environ.get('MAIL_USERNAME', ''))

db     = SQLAlchemy(app)
bcrypt = Bcrypt(app)
mail   = Mail(app)


# ─────────────────────────────────────────── MODELS

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)
    role = db.Column(db.String(20), default='user')  # admin / user
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_login = db.Column(db.DateTime)


class Contact(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    company = db.Column(db.String(200))
    name = db.Column(db.String(200))
    title = db.Column(db.String(200))
    sector = db.Column(db.String(100))
    segment = db.Column(db.String(50))
    stage = db.Column(db.String(50), default='Prospect')
    priority = db.Column(db.String(20), default='MEDIUM')
    score = db.Column(db.Integer, default=50)
    email = db.Column(db.String(200))
    email_status = db.Column(db.String(50))
    phone = db.Column(db.String(50))
    decision_maker = db.Column(db.Boolean, default=False)
    poei_offer = db.Column(db.Text)
    active_offers = db.Column(db.Text)
    action_type = db.Column(db.String(50))
    next_action = db.Column(db.Text)
    next_action_date = db.Column(db.String(20))
    deal_potential = db.Column(db.String(200))
    alert = db.Column(db.String(100))
    linkedin = db.Column(db.String(500))
    notes = db.Column(db.Text)
    done = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    stage_changed_at = db.Column(db.DateTime)
    last_activity_at = db.Column(db.DateTime)
    logs = db.relationship('ContactLog', backref='contact', lazy=True, cascade='all,delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'company': self.company or '',
            'name': self.name or '',
            'title': self.title or '',
            'sector': self.sector or '',
            'segment': self.segment or '',
            'stage': self.stage or 'Prospect',
            'priority': self.priority or 'MEDIUM',
            'score': self.score or 50,
            'email': self.email or '',
            'email_status': self.email_status or '',
            'phone': self.phone or '',
            'decision_maker': bool(self.decision_maker),
            'poei_offer': self.poei_offer or '',
            'active_offers': self.active_offers or '',
            'action_type': self.action_type or '',
            'next_action': self.next_action or '',
            'next_action_date': self.next_action_date or '',
            'deal_potential': self.deal_potential or '',
            'alert': self.alert or '',
            'linkedin': self.linkedin or '',
            'notes': self.notes or '',
            '_done': bool(self.done),
            'created_at': self.created_at.isoformat() if self.created_at else '',
            'stage_changed_at': self.stage_changed_at.isoformat() if self.stage_changed_at else '',
            'last_activity_at': self.last_activity_at.isoformat() if self.last_activity_at else '',
            'log': [l.to_dict() for l in self.logs],
        }


class ContactLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    contact_id = db.Column(db.Integer, db.ForeignKey('contact.id'), nullable=False)
    date = db.Column(db.String(50))
    type = db.Column(db.String(50))
    result = db.Column(db.Text)
    note = db.Column(db.Text)
    subject = db.Column(db.String(200))
    relance_date = db.Column(db.String(20))
    status = db.Column(db.String(50), default='En attente')  # En attente / Répondu / Relancé / Sans suite

    def to_dict(self):
        return {
            'id': self.id,
            'contact_id': self.contact_id,
            'date': self.date,
            'type': self.type,
            'result': self.result or '',
            'note': self.note or '',
            'subject': self.subject or '',
            'relance_date': self.relance_date or '',
            'status': self.status or 'En attente'
        }


class PlanTaskState(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    task_id = db.Column(db.String(100), nullable=False)
    done = db.Column(db.Boolean, default=False)
    __table_args__ = (db.UniqueConstraint('user_id', 'task_id'),)


# ─────────────────────────────────────────── AUTH HELPERS

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            if request.is_json or request.path.startswith('/api/'):
                return jsonify({'error': 'Non authentifié'}), 401
            return redirect(url_for('login_page'))
        return f(*args, **kwargs)
    return decorated

def current_user():
    uid = session.get('user_id')
    return User.query.get(uid) if uid else None


# ─────────────────────────────────────────── PAGES

@app.route('/')
@login_required
def index():
    u = current_user()
    return render_template('index.html', user=u)

@app.route('/login')
def login_page():
    if 'user_id' in session:
        return redirect(url_for('index'))
    return render_template('login.html')


# ─────────────────────────────────────────── AUTH API

@app.route('/auth/login', methods=['POST'])
def auth_login():
    data = request.get_json()
    username = (data.get('username') or '').strip().lower()
    password = data.get('password') or ''
    user = User.query.filter(
        (User.username == username) | (User.email == username)
    ).first()
    if not user or not bcrypt.check_password_hash(user.password_hash, password):
        return jsonify({'error': 'Identifiants incorrects'}), 401
    session.permanent = True
    session['user_id'] = user.id
    user.last_login = datetime.utcnow()
    db.session.commit()
    return jsonify({'ok': True, 'user': {'id': user.id, 'username': user.username, 'role': user.role}})

@app.route('/auth/logout', methods=['POST'])
def auth_logout():
    session.clear()
    return jsonify({'ok': True})

@app.route('/auth/me')
@login_required
def auth_me():
    u = current_user()
    return jsonify({'id': u.id, 'username': u.username, 'role': u.role})

@app.route('/auth/users', methods=['GET'])
@login_required
def auth_users():
    u = current_user()
    if u.role != 'admin':
        return jsonify({'error': 'Accès refusé'}), 403
    users = User.query.all()
    return jsonify([{'id': x.id, 'username': x.username, 'email': x.email, 'role': x.role,
                     'last_login': x.last_login.isoformat() if x.last_login else None} for x in users])

@app.route('/auth/users', methods=['POST'])
@login_required
def auth_create_user():
    u = current_user()
    if u.role != 'admin':
        return jsonify({'error': 'Accès refusé'}), 403
    data = request.get_json()
    username = (data.get('username') or '').strip().lower()
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''
    role = data.get('role', 'user')
    if not username or not email or not password:
        return jsonify({'error': 'Champs manquants'}), 400
    if User.query.filter((User.username == username) | (User.email == email)).first():
        return jsonify({'error': 'Utilisateur déjà existant'}), 409
    new_user = User(username=username, email=email,
                    password_hash=bcrypt.generate_password_hash(password).decode(),
                    role=role)
    db.session.add(new_user)
    db.session.commit()
    return jsonify({'ok': True, 'id': new_user.id})

@app.route('/auth/users/<int:uid>', methods=['DELETE'])
@login_required
def auth_delete_user(uid):
    u = current_user()
    if u.role != 'admin':
        return jsonify({'error': 'Accès refusé'}), 403
    if uid == u.id:
        return jsonify({'error': 'Impossible de supprimer votre propre compte'}), 400
    user = User.query.get_or_404(uid)
    db.session.delete(user)
    db.session.commit()
    return jsonify({'ok': True})


# ─────────────────────────────────────────── CONTACTS API

@app.route('/api/contacts')
@login_required
def api_contacts():
    contacts = Contact.query.all()
    return jsonify([c.to_dict() for c in contacts])

@app.route('/api/contacts', methods=['POST'])
@login_required
def api_create_contact():
    data = request.get_json()
    c = Contact(
        company=data.get('company',''), name=data.get('name',''),
        title=data.get('title',''), sector=data.get('sector',''),
        segment=data.get('segment','Long Term'), stage=data.get('stage','Prospect'),
        priority=data.get('priority','MEDIUM'), score=int(data.get('score',50)),
        email=data.get('email',''), email_status=data.get('email_status','unknown'),
        phone=data.get('phone',''), decision_maker=bool(data.get('decision_maker',False)),
        poei_offer=data.get('poei_offer',''), active_offers=data.get('active_offers',''),
        action_type=data.get('action_type','Email'), next_action=data.get('next_action',''),
        next_action_date=data.get('next_action_date',''), deal_potential=data.get('deal_potential',''),
        alert=data.get('alert',''), linkedin=data.get('linkedin',''), notes=data.get('notes',''),
        done=False
    )
    db.session.add(c)
    db.session.commit()
    return jsonify(c.to_dict()), 201

@app.route('/api/contacts/<int:cid>', methods=['DELETE'])
@login_required
def api_delete_contact(cid):
    c = Contact.query.get_or_404(cid)
    db.session.delete(c)
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/api/contacts/bulk', methods=['POST'])
@login_required
def api_bulk_update():
    data = request.get_json()
    ids = data.get('ids', [])
    updates = data.get('updates', {})
    ALLOWED = ['stage','segment','priority','action_type','next_action_date','alert','_done']
    for cid in ids:
        c = Contact.query.get(cid)
        if not c: continue
        for field, val in updates.items():
            if field not in ALLOWED: continue
            if field == '_done': c.done = bool(val)
            else: setattr(c, field, val)
    db.session.commit()
    return jsonify({'ok': True, 'updated': len(ids)})

@app.route('/api/contacts/export')
@login_required
def api_export_contacts():
    import csv, io
    contacts = Contact.query.all()
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=[
        'id','company','name','title','sector','segment','stage','priority','score',
        'email','email_status','phone','decision_maker','poei_offer','active_offers',
        'action_type','next_action','next_action_date','deal_potential','linkedin','notes'
    ])
    writer.writeheader()
    for c in contacts:
        d = c.to_dict()
        d.pop('log', None)
        d['decision_maker'] = 'Oui' if d.get('decision_maker') else 'Non'
        writer.writerow({k: d.get(k,'') for k in writer.fieldnames})
    from flask import Response
    return Response(
        '﻿' + output.getvalue(),
        mimetype='text/csv',
        headers={'Content-Disposition': 'attachment; filename=PNFB_CRM_Export.csv'}
    )

@app.route('/api/contacts/<int:cid>', methods=['GET'])
@login_required
def api_contact(cid):
    c = Contact.query.get_or_404(cid)
    return jsonify(c.to_dict())

@app.route('/api/contacts/<int:cid>', methods=['PATCH'])
@login_required
def api_update_contact(cid):
    c = Contact.query.get_or_404(cid)
    data = request.get_json()
    UPDATABLE = ['company','name','title','sector','segment','stage','priority','score',
                 'email','email_status','phone','decision_maker','poei_offer','active_offers',
                 'action_type','next_action','next_action_date','deal_potential','alert',
                 'linkedin','notes']
    for field in UPDATABLE:
        if field in data:
            setattr(c, field, data[field])
    if '_done' in data:
        c.done = bool(data['_done'])
    db.session.commit()
    return jsonify(c.to_dict())

@app.route('/api/contacts/<int:cid>/log', methods=['POST'])
@login_required
def api_add_log(cid):
    c = Contact.query.get_or_404(cid)
    data = request.get_json()
    log = ContactLog(
        contact_id=cid,
        date=data.get('date', datetime.now().strftime('%d/%m/%Y %H:%M')),
        type=data.get('type', 'Action'),
        result=data.get('result', ''),
        note=data.get('note', ''),
        subject=data.get('subject', ''),
        relance_date=data.get('relance_date', ''),
        status=data.get('status', 'En attente')
    )
    db.session.add(log)
    # Update contact activity timestamp + dynamic score
    c.last_activity_at = datetime.utcnow()
    if c.stage == 'Prospect' and data.get('type') in ('Email','Appel','LinkedIn'):
        c.stage = 'Contacted'
        c.stage_changed_at = datetime.utcnow()
    score_boost = {'Email':5,'Appel':8,'RDV':20,'LinkedIn':4,'Relance':3}.get(data.get('type',''),3)
    c.score = min(100, (c.score or 50) + score_boost)
    db.session.commit()
    return jsonify(log.to_dict())


@app.route('/api/emails/log/<int:lid>', methods=['PATCH'])
@login_required
def api_update_log(lid):
    log = ContactLog.query.get_or_404(lid)
    data = request.get_json()
    for field in ['status', 'relance_date', 'note', 'result']:
        if field in data:
            setattr(log, field, data[field])
    db.session.commit()
    return jsonify(log.to_dict())


@app.route('/api/emails/suivi')
@login_required
def api_emails_suivi():
    from datetime import date as ddate
    today = ddate.today().isoformat()
    logs = ContactLog.query.filter(ContactLog.type == 'Email').order_by(ContactLog.date.desc()).all()
    result = []
    for log in logs:
        c = Contact.query.get(log.contact_id)
        if not c:
            continue
        relance = log.relance_date or ''
        overdue = relance and relance < today and log.status == 'En attente'
        due_today = relance == today and log.status == 'En attente'
        result.append({
            **log.to_dict(),
            'company': c.company,
            'contact_name': c.name,
            'sector': c.sector,
            'segment': c.segment,
            'overdue': overdue,
            'due_today': due_today,
        })
    # Stats
    total = len(result)
    en_attente = sum(1 for r in result if r['status'] == 'En attente')
    repondus = sum(1 for r in result if r['status'] == 'Répondu')
    relances_dues = sum(1 for r in result if r['due_today'] or r['overdue'])
    taux = round(repondus / total * 100) if total else 0
    return jsonify({
        'logs': result,
        'stats': {
            'total': total,
            'en_attente': en_attente,
            'repondus': repondus,
            'relances_dues': relances_dues,
            'taux_reponse': taux,
        }
    })

@app.route('/api/contacts/<int:cid>/done', methods=['POST'])
@login_required
def api_mark_done(cid):
    c = Contact.query.get_or_404(cid)
    data = request.get_json()
    # Add log entry
    log = ContactLog(
        contact_id=cid,
        date=datetime.now().strftime('%d/%m/%Y %H:%M'),
        type=c.action_type or 'Action',
        result=data.get('result', f'Action {c.action_type} effectuée'),
        note=f"Prochaine: {data.get('next_type','')} — {data.get('next_txt','')}" if data.get('next_txt') else ''
    )
    db.session.add(log)
    # Update contact
    if data.get('stage'):
        c.stage = data['stage']
    if data.get('stage') and data['stage'] != c.stage:
        c.stage_changed_at = datetime.utcnow()
    if data.get('next_type'):
        c.action_type = data['next_type']
    if data.get('next_txt'):
        c.next_action = data['next_txt']
    if data.get('next_date'):
        c.next_action_date = data['next_date']
    c.last_activity_at = datetime.utcnow()
    c.done = False
    # Auto-advance stage to Contacted if still Prospect
    if c.stage == 'Prospect':
        c.stage = 'Contacted'
        c.stage_changed_at = datetime.utcnow()
    # Dynamic score boost
    boost_map = {'Appel': 8, 'Email': 5, 'RDV': 20, 'LinkedIn': 5, 'Relance': 3}
    boost = boost_map.get(c.action_type, 5)
    if data.get('result') and 'réponse' in data['result'].lower():
        boost += 10
    c.score = min(100, (c.score or 50) + boost)
    db.session.commit()
    return jsonify(c.to_dict())


# ─────────────────────────────────────────── MISSION CONTROL

@app.route('/api/mission')
@login_required
def api_mission():
    from datetime import date, timedelta
    import re
    today = date.today()
    today_str = today.isoformat()
    week_start = (today - timedelta(days=today.weekday())).isoformat()

    contacts = Contact.query.all()
    logs = ContactLog.query.all()

    # Weekly targets
    TARGETS = {'emails': 15, 'appels': 10, 'rdv': 3, 'relances': 5}
    week_logs = [l for l in logs if l.date and l.date[:10] >= week_start]
    cadence = {
        'emails':   sum(1 for l in week_logs if l.type == 'Email'),
        'appels':   sum(1 for l in week_logs if l.type == 'Appel'),
        'rdv':      sum(1 for l in week_logs if l.type == 'RDV'),
        'relances': sum(1 for l in week_logs if l.type == 'Relance'),
    }

    # Contacts touched this week
    touched_ids = {l.contact_id for l in week_logs}
    week_contacts = len(touched_ids)

    # Priority actions for today
    def priority_score(c):
        score = c.score or 50
        seg_bonus = {'Strategic': 30, 'Quick Win': 20, 'Partner': 15, 'Long Term': 5}.get(c.segment or '', 0)
        overdue_bonus = 25 if (c.next_action_date and c.next_action_date < today_str and not c.done) else 0
        today_bonus = 15 if c.next_action_date == today_str else 0
        never_bonus = 20 if c.id not in touched_ids else 0
        return score + seg_bonus + overdue_bonus + today_bonus + never_bonus

    actions = sorted(
        [c for c in contacts if not c.done and c.segment in ('Strategic', 'Quick Win', 'Partner')],
        key=priority_score, reverse=True
    )[:12]

    # Stuck contacts (no activity in 14+ days, not done)
    stuck = []
    for c in contacts:
        if c.last_activity_at:
            days_since = (datetime.utcnow() - c.last_activity_at).days
            if days_since >= 14 and not c.done:
                stuck.append({'id': c.id, 'company': c.company, 'days': days_since, 'stage': c.stage, 'score': c.score})
        elif c.segment in ('Strategic', 'Quick Win') and c.id not in touched_ids:
            stuck.append({'id': c.id, 'company': c.company, 'days': 999, 'stage': c.stage, 'score': c.score})

    stuck = sorted(stuck, key=lambda x: -x['score'])[:10]

    # Pipeline real stats
    stage_counts = {}
    for c in contacts:
        s = c.stage or 'Prospect'
        stage_counts[s] = stage_counts.get(s, 0) + 1

    # Wins this week
    wins = [l for l in week_logs if l.result and any(w in l.result.lower() for w in ['répondu', 'rdv', 'signé', 'intéressé', 'ok'])]

    return jsonify({
        'today': today_str,
        'week_start': week_start,
        'cadence': cadence,
        'targets': TARGETS,
        'week_contacts': week_contacts,
        'actions': [c.to_dict() for c in actions],
        'stuck': stuck,
        'stage_counts': stage_counts,
        'wins_this_week': len(wins),
        'total_contacts': len(contacts),
    })


@app.route('/api/mission/target', methods=['POST'])
@login_required
def api_set_target():
    # Store targets in session for now (could be DB)
    data = request.get_json()
    session['weekly_targets'] = data
    return jsonify({'ok': True})


# ─────────────────────────────────────────── GOALS

DEFAULT_GOALS = {'poei_target':50,'ca_target':150000,'poei_signed':0,'ca_signed':0,'period':'2026',
                 'weekly_emails':15,'weekly_calls':10,'weekly_rdv':3,'weekly_relances':5}

class Setting(db.Model):
    id    = db.Column(db.Integer, primary_key=True)
    key   = db.Column(db.String(100), unique=True, nullable=False)
    value = db.Column(db.String(500))

def _load_goals():
    result = DEFAULT_GOALS.copy()
    for s in Setting.query.all():
        if s.key in result:
            try: result[s.key] = int(s.value)
            except: result[s.key] = s.value
    return result

def _save_goals(d):
    for k, v in d.items():
        s = Setting.query.filter_by(key=k).first()
        if s: s.value = str(v)
        else: db.session.add(Setting(key=k, value=str(v)))
    db.session.commit()

@app.route('/api/goals')
@login_required
def api_get_goals():
    return jsonify(_load_goals())

@app.route('/api/goals', methods=['POST'])
@login_required
def api_set_goals():
    data = request.get_json()
    current = _load_goals()
    current.update(data)
    _save_goals(current)
    return jsonify({'ok': True, 'goals': current})

@app.route('/api/kanban')
@login_required
def api_kanban():
    import re
    PROB = {'Prospect':.05,'Contacted':.15,'Meeting':.35,'Proposal':.60,'Negotiation':.80,'Signed':1.0,'Deployed':1.0}
    def vol(s):
        m = re.search(r'(\d[\d\s]*)', str(s))
        return int(m.group(1).replace(' ','')) if m else 0
    contacts = Contact.query.all()
    by_stage = {}
    for c in contacts:
        s = c.stage or 'Prospect'
        if s not in by_stage: by_stage[s] = []
        by_stage[s].append({
            **c.to_dict(),
            'pipeline_val': vol(c.deal_potential or '') * 3000 * PROB.get(s, .05)
        })
    return jsonify(by_stage)

@app.route('/api/contacts/bulk-date', methods=['POST'])
@login_required
def api_bulk_reset_dates():
    from datetime import date, timedelta
    data = request.get_json()
    offset = int(data.get('days_offset', 0))
    segment = data.get('segment', '')
    contacts = Contact.query.all()
    updated = 0
    for c in contacts:
        if segment and c.segment != segment:
            continue
        new_date = (date.today() + timedelta(days=offset)).isoformat()
        c.next_action_date = new_date
        updated += 1
    db.session.commit()
    return jsonify({'ok': True, 'updated': updated})

# ─────────────────────────────────────────── STRATEGIC DATA

@app.route('/api/strategic')
@login_required
def api_strategic():
    if os.path.exists(STATIC_DATA):
        with open(STATIC_DATA, 'r', encoding='utf-8') as f:
            return jsonify(json.load(f))
    return jsonify({'templates': [], 'scripts': [], 'sectors': [], 'plan': [], 'kpis': {}})


# ─────────────────────────────────────────── PLAN STATE

@app.route('/api/plan/state')
@login_required
def api_plan_state():
    u = current_user()
    states = PlanTaskState.query.filter_by(user_id=u.id).all()
    return jsonify({s.task_id: s.done for s in states})

@app.route('/api/plan/state/<task_id>', methods=['POST'])
@login_required
def api_toggle_task(task_id):
    u = current_user()
    state = PlanTaskState.query.filter_by(user_id=u.id, task_id=task_id).first()
    if state:
        state.done = not state.done
    else:
        state = PlanTaskState(user_id=u.id, task_id=task_id, done=True)
        db.session.add(state)
    db.session.commit()
    return jsonify({'task_id': task_id, 'done': state.done})


# ─────────────────────────────────────────── STATS

@app.route('/api/metrics')
@login_required
def api_metrics():
    import re
    contacts = Contact.query.all()
    logs = ContactLog.query.all()
    PROB = {'Prospect':0.05,'Contacted':0.15,'Meeting':0.35,'Proposal':0.60,'Negotiation':0.80,'Signed':1.0,'Deployed':1.0}
    REV = 3000

    def parse_vol(s):
        m = re.search(r'(\d[\d\s]*)', str(s))
        return int(m.group(1).replace(' ','')) if m else 0

    pipeline_total = 0
    pipeline_by_sector = {}
    pipeline_by_stage = {}
    stage_counts = {}
    segment_counts = {}
    sector_counts = {}
    score_sum = 0

    for c in contacts:
        vol = parse_vol(c.deal_potential or '')
        prob = PROB.get(c.stage or 'Prospect', 0.05)
        val = vol * REV * prob
        pipeline_total += val
        pipeline_by_sector[c.sector] = pipeline_by_sector.get(c.sector, 0) + val
        pipeline_by_stage[c.stage or 'Prospect'] = pipeline_by_stage.get(c.stage or 'Prospect', 0) + val
        stage_counts[c.stage or 'Prospect'] = stage_counts.get(c.stage or 'Prospect', 0) + 1
        segment_counts[c.segment or 'Long Term'] = segment_counts.get(c.segment or 'Long Term', 0) + 1
        sector_counts[c.sector or 'Autre'] = sector_counts.get(c.sector or 'Autre', 0) + 1
        score_sum += c.score or 0

    # Activity by type from logs
    activity_by_type = {}
    for l in logs:
        activity_by_type[l.type or 'Action'] = activity_by_type.get(l.type or 'Action', 0) + 1

    # Recent activity (last 30 logs)
    recent = sorted(logs, key=lambda l: l.id, reverse=True)[:30]
    recent_list = []
    for l in recent:
        c = Contact.query.get(l.contact_id)
        recent_list.append({
            'date': l.date, 'type': l.type, 'result': l.result,
            'company': c.company if c else '?', 'contact': c.name if c else '?',
            'contact_id': l.contact_id
        })

    today = datetime.now().strftime('%Y-%m-%d')
    overdue = sum(1 for c in contacts if c.next_action_date and c.next_action_date < today and not c.done)
    today_actions = sum(1 for c in contacts if c.next_action_date == today and not c.done)

    # Top opportunities (highest score × deal volume)
    top_opps = sorted(contacts, key=lambda c: (c.score or 0) * parse_vol(c.deal_potential or ''), reverse=True)[:10]

    return jsonify({
        'pipeline_total': round(pipeline_total),
        'pipeline_by_sector': pipeline_by_sector,
        'pipeline_by_stage': pipeline_by_stage,
        'stage_counts': stage_counts,
        'segment_counts': segment_counts,
        'sector_counts': sector_counts,
        'avg_score': round(score_sum / len(contacts)) if contacts else 0,
        'total': len(contacts),
        'overdue': overdue,
        'today_actions': today_actions,
        'activity_by_type': activity_by_type,
        'recent_activity': recent_list,
        'top_opportunities': [c.to_dict() for c in top_opps],
        'signed': sum(1 for c in contacts if c.stage in ('Signed','Deployed')),
        'valid_emails': sum(1 for c in contacts if c.email_status in ('valid','Verified')),
        'total_logs': len(logs),
    })

@app.route('/api/stats')
@login_required
def api_stats():
    total = Contact.query.count()
    strategic = Contact.query.filter_by(segment='Strategic').count()
    valid_emails = Contact.query.filter(Contact.email_status.in_(['valid', 'Verified'])).count()
    signed = Contact.query.filter(Contact.stage.in_(['Signed', 'Deployed'])).count()
    today_str = datetime.now().strftime('%Y-%m-%d')
    overdue = Contact.query.filter(Contact.next_action_date < today_str, Contact.done == False).count()
    return jsonify({
        'total': total, 'strategic': strategic,
        'valid_emails': valid_emails, 'signed': signed, 'overdue': overdue
    })


@app.route('/health')
def health():
    try:
        user_count = User.query.count()
        db_ok = True
    except Exception as e:
        user_count = 0
        db_ok = False
    return jsonify({'status':'ok','app':'PNFB CRM','version':'2.0','db':db_ok,'users':user_count})

@app.errorhandler(500)
def err500(e):
    import traceback
    return jsonify({'error': str(e), 'detail': traceback.format_exc()}), 500

@app.route('/api/email/send', methods=['POST'])
@login_required
def api_send_email():
    if not app.config.get('MAIL_USERNAME'):
        return jsonify({'error': 'Email non configuré — ajoutez MAIL_USERNAME et MAIL_PASSWORD'}), 400
    d = request.json or {}
    to_addr    = d.get('to', '')
    subject    = d.get('subject', '')
    body       = d.get('body', '')
    contact_id = d.get('contact_id')
    if not to_addr or not subject:
        return jsonify({'error': 'Destinataire et sujet obligatoires'}), 400
    try:
        msg = Message(subject=subject, recipients=[to_addr], body=body)
        mail.send(msg)
        if contact_id:
            c = Contact.query.get(contact_id)
            if c:
                c.last_activity = datetime.utcnow()
                db.session.commit()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ── Init automatique DB (Railway/Render : appelé au démarrage de gunicorn) ───
def _auto_setup():
    try:
        db.create_all()
        if not User.query.filter_by(username='admin').first():
            pw = bcrypt.generate_password_hash('Admin2026!').decode()
            db.session.add(User(
                username='admin',
                email='admin@groupedefis.fr',
                password_hash=pw,
                role='admin'
            ))
            db.session.commit()
            print('✓ Admin créé : admin / Admin2026!')
        print('✓ Base de données prête')
    except Exception as e:
        print(f'⚠ Setup DB: {e}')

with app.app_context():
    _auto_setup()

if __name__ == '__main__':
    app.run(debug=os.environ.get('FLASK_ENV') != 'production', port=5050)
