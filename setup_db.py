"""Initialise la base de données au démarrage (Railway/Render)"""
from app import app, db, bcrypt, User

with app.app_context():
    db.create_all()
    if not User.query.filter_by(username='admin').first():
        pw = bcrypt.generate_password_hash('Admin2026!').decode()
        db.session.add(User(username='admin', email='admin@groupedefis.fr',
                            password_hash=pw, role='admin'))
        db.session.commit()
        print('✓ Admin créé (admin / Admin2026!)')
    else:
        print('✓ Base de données déjà initialisée')
    print('✓ Tables prêtes')
