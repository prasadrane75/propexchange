CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('buyer', 'seller', 'admin')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS properties (
  id SERIAL PRIMARY KEY,
  seller_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_total NUMERIC(12, 2) NOT NULL,
  shares_total INTEGER NOT NULL,
  shares_available INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS investments (
  id SERIAL PRIMARY KEY,
  buyer_id INTEGER NOT NULL REFERENCES users(id),
  property_id INTEGER NOT NULL REFERENCES properties(id),
  shares INTEGER NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS property_photos (
  id SERIAL PRIMARY KEY,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
