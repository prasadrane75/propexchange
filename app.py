from flask import Flask, render_template, request, redirect, url_for, flash, jsonify, session
import sqlite3
import os
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from functools import wraps
from datetime import datetime
from PIL import Image

# Use pbkdf2 instead of scrypt for compatibility with macOS LibreSSL
def generate_password_hash_pbkdf2(password):
    return generate_password_hash(password, method='pbkdf2')

def check_password_hash_pbkdf2(hash, password):
    return check_password_hash(hash, password)

# Lazy import textgen only when needed (description generation endpoint)
textgen = None

BASE_DIR = os.path.dirname(__file__)
DB_PATH = os.path.join(BASE_DIR, 'marketplace.db')
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}
MAX_FILESIZE = 5 * 1024 * 1024  # 5MB

# Create uploads directory if it doesn't exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

app = Flask(__name__)
app.secret_key = 'dev-secret-for-demo'
app.config['MAX_CONTENT_LENGTH'] = MAX_FILESIZE
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def save_uploaded_file(file):
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S_')
        filename = timestamp + filename
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        
        # Save and resize image
        try:
            img = Image.open(file)
            # Resize to 400x300 pixels for better card fit
            img.thumbnail((400, 300), Image.Resampling.LANCZOS)
            # Convert to RGB if necessary (for PNG with transparency)
            if img.mode in ('RGBA', 'LA', 'P'):
                rgb_img = Image.new('RGB', img.size, (255, 255, 255))
                rgb_img.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
                rgb_img.save(filepath, 'JPEG', quality=75)
            else:
                img.save(filepath, 'JPEG', quality=75)
            return filename
        except Exception as e:
            app.logger.error(f"Error processing image: {e}")
            return None
    return None

def init_db():
    if os.path.exists(DB_PATH):
        return
    conn = get_db_connection()
    conn.execute(
        '''
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'buyer'
        )
        '''
    )
    conn.execute(
        '''
        CREATE TABLE items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            seller_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            price REAL NOT NULL DEFAULT 0,
            quantity INTEGER NOT NULL DEFAULT 1,
            image_filename TEXT,
            FOREIGN KEY(seller_id) REFERENCES users(id)
        )
        '''
    )
    conn.execute(
        '''
        CREATE TABLE purchases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            buyer_id INTEGER NOT NULL,
            item_id INTEGER NOT NULL,
            seller_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            price REAL NOT NULL,
            purchase_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(buyer_id) REFERENCES users(id),
            FOREIGN KEY(item_id) REFERENCES items(id),
            FOREIGN KEY(seller_id) REFERENCES users(id)
        )
        '''
    )
    conn.commit()
    conn.close()


app.logger.setLevel(10)

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            flash('Please log in first.', 'warning')
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

def seller_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            flash('Please log in first.', 'warning')
            return redirect(url_for('login'))
        conn = get_db_connection()
        user = conn.execute('SELECT role FROM users WHERE id = ?', (session['user_id'],)).fetchone()
        conn.close()
        if not user or user['role'] != 'seller':
            flash('Only sellers can list items.', 'danger')
            return redirect(url_for('index'))
        return f(*args, **kwargs)
    return decorated_function

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '').strip()
        role = request.form.get('role', 'buyer')
        
        if not username or not password:
            flash('Username and password are required.', 'warning')
            return redirect(url_for('register'))
        
        if role not in ['buyer', 'seller']:
            flash('Invalid role.', 'danger')
            return redirect(url_for('register'))
        
        conn = get_db_connection()
        try:
            conn.execute('INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
                         (username, generate_password_hash_pbkdf2(password), role))
            conn.commit()
            conn.close()
            flash('Registration successful! Please log in.', 'success')
            return redirect(url_for('login'))
        except sqlite3.IntegrityError:
            conn.close()
            flash('Username already exists.', 'danger')
            return redirect(url_for('register'))
    
    return render_template('register.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '').strip()
        
        if not username or not password:
            flash('Username and password are required.', 'warning')
            return redirect(url_for('login'))
        
        conn = get_db_connection()
        user = conn.execute('SELECT id, username, password, role FROM users WHERE username = ?', (username,)).fetchone()
        conn.close()
        
        if user and check_password_hash_pbkdf2(user['password'], password):
            session['user_id'] = user['id']
            session['username'] = user['username']
            session['role'] = user['role']
            flash(f"Welcome {user['username']}!", 'success')
            return redirect(url_for('index'))
        else:
            flash('Invalid username or password.', 'danger')
            return redirect(url_for('login'))
    
    return render_template('login.html')

@app.route('/logout')
def logout():
    session.clear()
    flash('You have been logged out.', 'success')
    return redirect(url_for('index'))

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    from flask import send_from_directory
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/')
def index():
    conn = get_db_connection()
    items = conn.execute('''
        SELECT i.id, i.seller_id, i.title, i.description, i.price, i.quantity, i.image_filename, u.username 
        FROM items i 
        LEFT JOIN users u ON i.seller_id = u.id
    ''').fetchall()
    conn.close()
    return render_template('index.html', items=items)

@app.route('/sell', methods=['GET', 'POST'])
@seller_required
def sell():
    if request.method == 'POST':
        title = request.form.get('title', '').strip()
        description = request.form.get('description', '').strip()
        price = request.form.get('price', '0').strip()
        quantity = request.form.get('quantity', '1').strip()
        if not title or not price or not quantity:
            flash('Title, price and quantity are required.', 'warning')
            return redirect(url_for('sell'))
        try:
            price_val = float(price)
            qty = int(quantity)
        except ValueError:
            flash('Price must be a number and quantity an integer.', 'warning')
            return redirect(url_for('sell'))
        
        # Handle image upload
        image_filename = None
        if 'image' in request.files:
            file = request.files['image']
            if file.filename != '':
                if not allowed_file(file.filename):
                    flash('Only PNG, JPG, JPEG, and GIF images are allowed.', 'warning')
                    return redirect(url_for('sell'))
                image_filename = save_uploaded_file(file)
                if not image_filename:
                    flash('Error uploading image.', 'danger')
                    return redirect(url_for('sell'))
        
        conn = get_db_connection()
        conn.execute('INSERT INTO items (seller_id, title, description, price, quantity, image_filename) VALUES (?, ?, ?, ?, ?, ?)',
                     (session['user_id'], title, description, price_val, qty, image_filename))
        conn.commit()
        conn.close()
        flash('Item listed for sale.', 'success')
        return redirect(url_for('index'))
    return render_template('sell.html')

@app.route('/edit/<int:item_id>', methods=['GET', 'POST'])
@seller_required
def edit(item_id):
    conn = get_db_connection()
    item = conn.execute('SELECT * FROM items WHERE id = ?', (item_id,)).fetchone()
    if not item:
        conn.close()
        flash('Item not found.', 'danger')
        return redirect(url_for('index'))
    
    # Check if user is the seller
    if item['seller_id'] != session['user_id']:
        conn.close()
        flash('You can only edit your own items.', 'danger')
        return redirect(url_for('index'))
    
    if request.method == 'POST':
        price = request.form.get('price', '0').strip()
        quantity = request.form.get('quantity', '1').strip()
        
        if not price or not quantity:
            flash('Price and quantity are required.', 'warning')
            return redirect(url_for('edit', item_id=item_id))
        
        try:
            price_val = float(price)
            qty = int(quantity)
        except ValueError:
            flash('Price must be a number and quantity an integer.', 'warning')
            return redirect(url_for('edit', item_id=item_id))
        
        # Handle new image upload
        image_filename = item['image_filename']
        if 'image' in request.files:
            file = request.files['image']
            if file.filename != '':
                if not allowed_file(file.filename):
                    conn.close()
                    flash('Only PNG, JPG, JPEG, and GIF images are allowed.', 'warning')
                    return redirect(url_for('edit', item_id=item_id))
                new_filename = save_uploaded_file(file)
                if not new_filename:
                    conn.close()
                    flash('Error uploading image.', 'danger')
                    return redirect(url_for('edit', item_id=item_id))
                # Delete old image if it exists
                if image_filename:
                    old_path = os.path.join(app.config['UPLOAD_FOLDER'], image_filename)
                    if os.path.exists(old_path):
                        try:
                            os.remove(old_path)
                        except:
                            pass
                image_filename = new_filename
        
        conn.execute('UPDATE items SET price = ?, quantity = ?, image_filename = ? WHERE id = ?',
                     (price_val, qty, image_filename, item_id))
        conn.commit()
        conn.close()
        flash('Item updated successfully.', 'success')
        return redirect(url_for('index'))
    
    conn.close()
    return render_template('edit.html', item=item)

@app.route('/buy/<int:item_id>', methods=['POST'])
@login_required
def buy(item_id):
    conn = get_db_connection()
    item = conn.execute('SELECT * FROM items WHERE id = ?', (item_id,)).fetchone()
    if not item:
        conn.close()
        flash('Item not found.', 'danger')
        return redirect(url_for('index'))
    if item['quantity'] <= 0:
        conn.close()
        flash('Item is out of stock.', 'warning')
        return redirect(url_for('index'))
    conn.execute('UPDATE items SET quantity = quantity - 1 WHERE id = ?', (item_id,))
    conn.execute('INSERT INTO purchases (buyer_id, item_id, seller_id, title, price) VALUES (?, ?, ?, ?, ?)',
                 (session['user_id'], item_id, item['seller_id'], item['title'], item['price']))
    conn.commit()
    conn.close()
    flash(f"Bought '{item['title']}' for ${item['price']:.2f}", 'success')
    return redirect(url_for('index'))

@app.route('/purchases')
@login_required
def purchases():
    conn = get_db_connection()
    if session.get('role') == 'seller':
        # Sellers see items they sold
        purchases_data = conn.execute('''
            SELECT p.id, p.title, p.price, p.purchase_date, u.username as buyer_name
            FROM purchases p
            JOIN users u ON p.buyer_id = u.id
            WHERE p.seller_id = ?
            ORDER BY p.purchase_date DESC
        ''', (session['user_id'],)).fetchall()
        view_type = 'sales'
    else:
        # Buyers see items they bought
        purchases_data = conn.execute('''
            SELECT p.id, p.title, p.price, p.purchase_date, u.username as seller_name
            FROM purchases p
            JOIN users u ON p.seller_id = u.id
            WHERE p.buyer_id = ?
            ORDER BY p.purchase_date DESC
        ''', (session['user_id'],)).fetchall()
        view_type = 'purchases'
    conn.close()
    return render_template('purchases.html', purchases_data=purchases_data, view_type=view_type)

@app.route('/generate-description', methods=['POST'])
def generate_description_endpoint():
    global textgen
    try:
        if textgen is None:
            import textgen as tg
            textgen = tg
    except RuntimeError as e:
        return jsonify({'error': 'Claude API not configured', 'message': str(e)}), 503
    
    data = request.get_json() or {}
    title = data.get('title') or request.form.get('title', '')
    price = data.get('price')
    try:
        price_val = float(price) if price not in (None, '') else None
    except (TypeError, ValueError):
        price_val = None
    if not title:
        return jsonify({'error': 'title required'}), 400
    try:
        desc = textgen.generate_description(title=title, price=price_val)
    except Exception as e:
        return jsonify({'error': 'generation_failed', 'message': str(e)}), 500
    return jsonify({'description': desc})

if __name__ == '__main__':
    init_db()
    app.run(host='127.0.0.1', port=4000, debug=True)
