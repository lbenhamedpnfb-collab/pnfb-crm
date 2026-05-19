"""Initialise et migre la base de données au démarrage (Railway/Render)"""
from app import app, db, bcrypt, User
from sqlalchemy import text, inspect

# Colonnes attendues par table : (nom, définition SQL)
CONTACT_MIGRATIONS = [
    ("score_commercial",  "INTEGER DEFAULT 0"),
    ("score_activity",    "INTEGER DEFAULT 20"),
    ("data_quality",      "INTEGER DEFAULT 0"),
    ("archived",          "BOOLEAN DEFAULT FALSE"),
    ("stage_changed_at",  "TIMESTAMP"),
    ("last_activity_at",  "TIMESTAMP"),
    ("owner_id",          "INTEGER"),
    ("linkedin",          "VARCHAR(500)"),
    ("notes",             "TEXT"),
    ("active_offers",     "TEXT"),
    ("deal_potential",    "VARCHAR(200)"),
    ("alert",             "VARCHAR(100)"),
    ("email_status",      "VARCHAR(50)"),
    ("done",              "BOOLEAN DEFAULT FALSE"),
]

CONTACT_LOG_MIGRATIONS = [
    ("subject",       "VARCHAR(200)"),
    ("relance_date",  "VARCHAR(20)"),
    ("status",        "VARCHAR(50) DEFAULT 'En attente'"),
]

with app.app_context():
    db.create_all()

    inspector = inspect(db.engine)

    def migrate_table(table_name, migrations):
        try:
            existing = {col['name'] for col in inspector.get_columns(table_name)}
        except Exception:
            return
        with db.engine.connect() as conn:
            for col_name, col_def in migrations:
                if col_name not in existing:
                    try:
                        conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_def}"))
                        conn.commit()
                        print(f"  ✓ Migration: {table_name}.{col_name} ajoutée")
                    except Exception as e:
                        conn.rollback()
                        print(f"  ! Migration {table_name}.{col_name}: {e}")

    migrate_table("contact",     CONTACT_MIGRATIONS)
    migrate_table("contact_log", CONTACT_LOG_MIGRATIONS)

    if not User.query.filter_by(username='admin').first():
        pw = bcrypt.generate_password_hash('Admin2026!').decode()
        db.session.add(User(username='admin', email='admin@groupedefis.fr',
                            password_hash=pw, role='admin'))
        db.session.commit()
        print('✓ Admin créé (admin / Admin2026!)')
    else:
        print('✓ Base de données déjà initialisée')

    print('✓ Tables et migrations prêtes')
